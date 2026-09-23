import { Redis } from "ioredis";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createOutboxWriter } from "@nitap/database/outbox";
import { dedupeKeyFor, defineJob, emailSend } from "@nitap/jobs";
import type { QueuePort } from "@nitap/queue";
import { createFakeStoragePort } from "@nitap/storage";
import {
  createRedisNamespace,
  createTestDatabase,
  startSmtpTestServer,
  type RedisNamespace,
  type SmtpTestServer,
  type TestDatabase,
} from "@nitap/testing";

import { composeWorker } from "../src/compose.ts";
import type { ComposedWorker } from "../src/compose.ts";
import { recordingMetrics, silentLogger } from "./support.ts";

// Production contract with millisecond retries so the tests do not wait for real backoff.
const fastEmailJob = defineJob({
  ...emailSend,
  retry: { attempts: 4, baseDelayMs: 40, maxDelayMs: 120, jitter: 0 },
});

const eventually = (assertion: () => unknown | Promise<unknown>) =>
  vi.waitFor(assertion, { timeout: 10_000, interval: 25 });
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** TASK.md Phase 11 failure-behaviour matrix, through the real composed worker (outbox → relay → queue → processor). */
describe("notification delivery failure behaviour (real PostgreSQL, Redis and SMTP)", () => {
  let db: TestDatabase;
  let smtp: SmtpTestServer;
  let ns: RedisNamespace;
  const workers: ComposedWorker[] = [];
  const writer = createOutboxWriter({ requestId: () => "req-notif" });

  beforeEach(async () => {
    db = await createTestDatabase();
    smtp = await startSmtpTestServer();
    ns = await createRedisNamespace();
  });

  afterEach(async () => {
    for (const worker of workers.splice(0)) await worker.stop();
    await smtp.close();
    await ns.cleanup();
    await db.drop();
  });

  const startWorker = async (wrapQueue?: (queue: QueuePort) => QueuePort) => {
    const metrics = recordingMetrics();
    const worker = composeWorker(
      {
        prisma: db.prisma,
        logger: silentLogger(),
        metrics,
        storage: createFakeStoragePort(),
        config: {
          queueRedisUrl: ns.url,
          cacheRedisUrl: process.env.REDIS_URL,
          queuePrefix: ns.prefix,
          smtpUrl: smtp.url,
          emailFrom: "NITAP <no-reply@alumni.test>",
          appUrl: "https://alumni.example",
          emailRatePerSecond: 50,
        },
      },
      {
        emailJob: fastEmailJob,
        wrapQueue,
        relay: { pollIntervalMs: 40 },
        smtp: {
          connectionTimeoutMs: 500,
          greetingTimeoutMs: 500,
          socketTimeoutMs: 500,
        },
        unknownVersionDelayMs: 200,
      }
    );
    workers.push(worker);
    await worker.start();
    return { worker, metrics };
  };

  const makeUser = (name: string) =>
    db.prisma.user.create({
      data: {
        name,
        email: `${name}@example.test`,
        emailVerified: true,
        accountState: "VERIFIED",
      },
    });

  /** A `connection.requested` from `actor` to `recipient`, written in a transaction like a real use case. */
  const requestConnection = async (actorId: string, recipientId: string) =>
    db.prisma.$transaction((tx) =>
      writer.add(tx, {
        type: "connection.requested",
        payload: {
          v: 1,
          connectionId: "22222222-2222-4222-8222-222222222222",
          actorId,
          recipientId,
        },
      })
    );

  const notifications = (recipientId: string) =>
    db.prisma.notification.findMany({ where: { recipientId } });
  const emailDeliveries = (recipientId: string) =>
    db.prisma.notificationDelivery.findMany({
      where: { channel: "EMAIL", notification: { recipientId } },
    });

  it("core operation succeeds while the email provider is down; the email is delivered after recovery", async () => {
    const [actor, recipient] = await Promise.all([
      makeUser("actor"),
      makeUser("recipient"),
    ]);
    smtp.setMode("reject-transient");
    await startWorker();

    const { id } = await requestConnection(actor.id, recipient.id);

    // The outbox row is published and the in-app notification exists with SMTP down; email is PENDING.
    await eventually(async () =>
      expect(await notifications(recipient.id)).toHaveLength(1)
    );
    await eventually(async () =>
      expect(
        (await db.prisma.outboxEvent.findUniqueOrThrow({ where: { id } }))
          .publishedAt
      ).not.toBeNull()
    );
    await eventually(async () =>
      expect(
        (await emailDeliveries(recipient.id)).map((d) => d.status)
      ).toEqual(["PENDING"])
    );
    await wait(300);
    expect(smtp.received).toHaveLength(0); // still retrying, nothing lost

    smtp.setMode("accept");
    await eventually(() => expect(smtp.received).toHaveLength(1));
    expect(smtp.received[0]!.to).toEqual(["recipient@example.test"]);
    expect(await notifications(recipient.id)).toHaveLength(1);
    await eventually(async () =>
      expect(
        (await emailDeliveries(recipient.id)).map((d) => d.status)
      ).toEqual(["SENT"])
    );
  });

  it("a redelivered outbox event reaches the consumer again yet yields one notification, one email, one unread bump", async () => {
    const [actor, recipient] = await Promise.all([
      makeUser("actor"),
      makeUser("recipient"),
    ]);
    const redis = new Redis(process.env.REDIS_URL!);
    const unreadKey = `notif:unread:${recipient.id}`;
    const queueRedis = new Redis(ns.url);
    try {
      const { metrics } = await startWorker();
      const infoCalls = () =>
        metrics.increment.mock.calls.filter(
          ([name, labels]) =>
            name === "jobs_processed_total" &&
            (labels as { job?: string; outcome?: string })?.job ===
              "connection.requested" &&
            (labels as { outcome?: string }).outcome === "completed"
        ).length;
      const { id } = await requestConnection(actor.id, recipient.id);
      await eventually(() => expect(smtp.received).toHaveLength(1));
      await eventually(async () =>
        expect(
          (await db.prisma.outboxEvent.findUniqueOrThrow({ where: { id } }))
            .publishedAt
        ).not.toBeNull()
      );
      const before = infoCalls();

      // Drop the retained completed job so BullMQ's jobId dedupe cannot absorb the redelivery:
      // the relay re-adds it and the processor genuinely runs a second time with the same event id.
      const keys = await queueRedis.keys(`${ns.prefix}:*:${id}`);
      expect(keys.length).toBeGreaterThan(0);
      await queueRedis.del(...keys);
      await db.prisma.outboxEvent.update({
        where: { id },
        data: { publishedAt: null },
      });
      await eventually(() => expect(infoCalls()).toBeGreaterThan(before));
      await wait(400);

      expect(await notifications(recipient.id)).toHaveLength(1);
      expect(smtp.received).toHaveLength(1);
      expect(await redis.get(unreadKey)).toBe("1");
    } finally {
      await redis.del(unreadKey);
      redis.disconnect();
      queueRedis.disconnect();
    }
  });

  it("resumes a delivery whose in-app row exists but whose email step never ran: exactly one email", async () => {
    const [actor, recipient] = await Promise.all([
      makeUser("actor"),
      makeUser("recipient"),
    ]);
    const { id } = await requestConnection(actor.id, recipient.id);
    // State left by a worker that died after the in-app write and before the email enqueue.
    const row = await db.prisma.notification.create({
      data: {
        recipientId: recipient.id,
        type: "connection.requested",
        category: "ENGAGEMENT",
        payload: { connectionId: "22222222-2222-4222-8222-222222222222" },
        dedupeKey: dedupeKeyFor({
          eventId: id,
          recipientId: recipient.id,
          type: "connection.requested",
        }),
      },
    });
    await db.prisma.notificationDelivery.create({
      data: {
        notificationId: row.id,
        channel: "IN_APP",
        status: "SENT",
        attempts: 1,
      },
    });
    await startWorker();

    await eventually(() => expect(smtp.received).toHaveLength(1));
    // The resumed step recorded exactly one EMAIL delivery row (not a second one on top of a lost first
    // try, now enforced by a DB-level unique (notificationId, channel) constraint); its status races the
    // send outcome (PENDING then SENT), so only PENDING/SENT are acceptable, never a second row or FAILED.
    await eventually(async () => {
      const rows = await emailDeliveries(recipient.id);
      expect(rows).toHaveLength(1);
      expect(["PENDING", "SENT"]).toContain(rows[0]!.status);
    });
    await wait(300);
    expect(smtp.received).toHaveLength(1);
    expect(await notifications(recipient.id)).toHaveLength(1);
  });

  it("a recipient without a preference row gets the default (email on); one who disabled the domain gets in-app only", async () => {
    const [actor, defaults, optedOut] = await Promise.all([
      makeUser("actor"),
      makeUser("defaults"),
      makeUser("optedout"),
    ]);
    await db.prisma.notificationPreference.create({
      data: {
        userId: optedOut.id,
        domain: "CONNECTION",
        channel: "EMAIL",
        enabled: false,
      },
    });
    await startWorker();

    await requestConnection(actor.id, defaults.id);
    await requestConnection(actor.id, optedOut.id);

    await eventually(async () => {
      expect(await notifications(defaults.id)).toHaveLength(1);
      expect(await notifications(optedOut.id)).toHaveLength(1);
    });
    await eventually(() => expect(smtp.received).toHaveLength(1));
    await wait(300);
    expect(smtp.received.flatMap((m) => m.to)).toEqual([
      "defaults@example.test",
    ]);
    expect(await emailDeliveries(optedOut.id)).toHaveLength(0);
  });

  it("a blocked pair produces no notification and no email", async () => {
    const [actor, recipient, control] = await Promise.all([
      makeUser("actor"),
      makeUser("recipient"),
      makeUser("control"),
    ]);
    const [userAId, userBId] =
      actor.id < recipient.id
        ? [actor.id, recipient.id]
        : [recipient.id, actor.id];
    await db.prisma.connection.create({
      data: {
        userAId,
        userBId,
        requestedById: actor.id,
        blockedById: recipient.id,
        state: "BLOCKED",
      },
    });
    await startWorker();

    await requestConnection(actor.id, recipient.id);
    await requestConnection(actor.id, control.id); // proves the pipeline ran

    await eventually(async () =>
      expect(await notifications(control.id)).toHaveLength(1)
    );
    await eventually(() => expect(smtp.received).toHaveLength(1));
    await wait(300);
    expect(await notifications(recipient.id)).toHaveLength(0);
    expect(smtp.received).toHaveLength(1);
  });

  it("loses nothing when the queue Redis is down: rows stay unpublished, then drain without duplicates", async () => {
    const [actor, recipient] = await Promise.all([
      makeUser("actor"),
      makeUser("recipient"),
    ]);
    let redisDown = true;
    await startWorker((queue) => ({
      ...queue,
      add: async (...args) => {
        if (redisDown) throw new Error("redis unreachable");
        return queue.add(...args);
      },
    }));

    const { id } = await requestConnection(actor.id, recipient.id);
    await wait(500);
    expect(
      (await db.prisma.outboxEvent.findUniqueOrThrow({ where: { id } }))
        .publishedAt
    ).toBeNull();
    expect(await notifications(recipient.id)).toHaveLength(0);

    redisDown = false;
    await eventually(() => expect(smtp.received).toHaveLength(1));
    await wait(300);
    expect(await notifications(recipient.id)).toHaveLength(1);
    expect(smtp.received).toHaveLength(1);
  });

  it("a failure between the in-app write and the email enqueue is retried: no lost and no duplicated notification or email", async () => {
    const [actor, recipient] = await Promise.all([
      makeUser("actor"),
      makeUser("recipient"),
    ]);
    let failedOnce = false;
    await startWorker((queue) => ({
      ...queue,
      add: async (job, ...rest) => {
        // Simulates the worker dying after the in-app row committed, before the email was queued.
        if (job.name === "email.send" && !failedOnce) {
          failedOnce = true;
          throw new Error("queue unreachable");
        }
        return queue.add(job, ...rest);
      },
    }));

    await requestConnection(actor.id, recipient.id);

    await eventually(() => expect(smtp.received).toHaveLength(1));
    await wait(400);
    expect(failedOnce).toBe(true);
    expect(await notifications(recipient.id)).toHaveLength(1);
    expect(smtp.received).toHaveLength(1);
  });

  // N-12 / TASK.md: retry exhaustion must end in NotificationDelivery FAILED with an alert-worthy metric.
  it("permanent email failure ends in NotificationDelivery FAILED with a metric, not infinite retry", async () => {
    const [actor, recipient] = await Promise.all([
      makeUser("actor"),
      makeUser("recipient"),
    ]);
    smtp.setMode("reject-permanent");
    const { metrics } = await startWorker();

    await requestConnection(actor.id, recipient.id);

    await eventually(async () =>
      expect(
        (await emailDeliveries(recipient.id)).map((d) => d.status)
      ).toEqual(["FAILED"])
    );
    expect(metrics.increment).toHaveBeenCalledWith(
      "notification_delivery_failed_total",
      expect.anything()
    );
  });
});
