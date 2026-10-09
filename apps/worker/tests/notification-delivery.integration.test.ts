import { Redis } from "ioredis";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createOutboxWriter } from "@nitap/database/outbox";
import { hashEmail } from "@nitap/email";
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

/**
 * Failure-behaviour matrix, through the real composed worker (outbox → relay →
 * queue → processor).
 */
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

  const startWorker = async (
    wrapQueue?: (queue: QueuePort) => QueuePort,
    cacheRedisUrl: string | undefined = process.env.REDIS_URL
  ) => {
    const metrics = recordingMetrics();
    const worker = composeWorker(
      {
        prisma: db.prisma,
        logger: silentLogger(),
        metrics,
        storage: createFakeStoragePort(),
        config: {
          queueRedisUrl: ns.url,
          cacheRedisUrl,
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

  /**
   * A `connection.requested` from `actor` to `recipient`, written in a
   * transaction like a real use case.
   */
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
      await redis.set(unreadKey, "0", "EX", 300); // the web seeds the key; the worker only bumps an existing one
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
    // Exactly one EMAIL row; its status may be PENDING or SENT, never FAILED.
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

  // Retry exhaustion must end in NotificationDelivery FAILED with an alert-worthy metric.
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

  // The cache Redis (unread counter, hints, debounce) going down only degrades real-time push.
  it("a dead cache Redis still writes the in-app row, records EMAIL PENDING and sends the email", async () => {
    const [actor, recipient] = await Promise.all([
      makeUser("actor"),
      makeUser("recipient"),
    ]);
    // Nothing listens on port 1.
    const { metrics } = await startWorker(undefined, "redis://127.0.0.1:1");

    await requestConnection(actor.id, recipient.id);

    await eventually(async () =>
      expect(await notifications(recipient.id)).toHaveLength(1)
    );
    await eventually(async () =>
      expect(await emailDeliveries(recipient.id)).toHaveLength(1)
    );
    await eventually(() => expect(smtp.received).toHaveLength(1));
    // First attempt succeeded: the cache outage did not fail the job into a retry.
    expect(
      metrics.increment.mock.calls.filter(
        ([name, labels]) =>
          name === "jobs_processed_total" &&
          (labels as { job?: string }).job === "connection.requested" &&
          (labels as { outcome?: string }).outcome !== "completed"
      )
    ).toEqual([]);
  });

  it("a dead cache Redis still delivers message.sent in-app notifications", async () => {
    const [sender, recipient] = await Promise.all([
      makeUser("sender"),
      makeUser("recipient"),
    ]);
    const conversation = await db.prisma.conversation.create({
      data: {
        createdById: sender.id,
        isGroup: true,
        title: "t",
        participants: {
          create: [{ userId: sender.id }, { userId: recipient.id }],
        },
      },
    });
    const message = await db.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: sender.id,
        body: "hi",
        clientMessageId: "44444444-4444-4444-8444-444444444444",
      },
    });
    await startWorker(undefined, "redis://127.0.0.1:1");

    await db.prisma.$transaction((tx) =>
      writer.add(tx, {
        type: "message.sent",
        payload: {
          v: 1,
          messageId: message.id,
          conversationId: conversation.id,
          senderId: sender.id,
        },
      })
    );

    await eventually(async () =>
      expect(await notifications(recipient.id)).toHaveLength(1)
    );
    // Without the debounce window there is no email at all, rather than one per message.
    await wait(300);
    expect(smtp.received).toHaveLength(0);
  });

  // One row per (recipient, conversation, window), not one per message.
  it("two message.sent in one debounce window make one notification and one email; reading opens a new window", async () => {
    const [sender, recipient] = await Promise.all([
      makeUser("sender"),
      makeUser("recipient"),
    ]);
    const conversation = await db.prisma.conversation.create({
      data: {
        createdById: sender.id,
        isGroup: true,
        title: "t",
        participants: {
          create: [{ userId: sender.id }, { userId: recipient.id }],
        },
      },
    });
    const redis = new Redis(process.env.REDIS_URL!);
    const debounceKey = `notif:debounce:${recipient.id}:${conversation.id}`;
    const send = async (clientMessageId: string) => {
      const message = await db.prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderId: sender.id,
          body: "hi",
          clientMessageId,
        },
      });
      await db.prisma.$transaction((tx) =>
        writer.add(tx, {
          type: "message.sent",
          payload: {
            v: 1,
            messageId: message.id,
            conversationId: conversation.id,
            senderId: sender.id,
          },
        })
      );
    };
    try {
      await startWorker();
      await send("44444444-4444-4444-8444-444444444441");
      await eventually(() => expect(smtp.received).toHaveLength(1));
      await db.prisma.notification.updateMany({
        where: { recipientId: recipient.id },
        data: { readAt: new Date() },
      });
      await send("44444444-4444-4444-8444-444444444442");
      // The second message bumps the same row back to unread.
      await eventually(async () => {
        const rows = await notifications(recipient.id);
        expect(rows).toHaveLength(1);
        expect(rows[0]!.readAt).toBeNull();
      });
      await wait(300);
      expect(smtp.received).toHaveLength(1);

      await redis.del(debounceKey); // what reading the conversation does in the web app
      await send("44444444-4444-4444-8444-444444444443");
      await eventually(async () =>
        expect(await notifications(recipient.id)).toHaveLength(2)
      );
      await eventually(() => expect(smtp.received).toHaveLength(2));
    } finally {
      await redis.del(debounceKey);
      redis.disconnect();
    }
  });

  it("a suppressed address gets the in-app notification but no email", async () => {
    const [actor, recipient, control] = await Promise.all([
      makeUser("actor"),
      makeUser("recipient"),
      makeUser("control"),
    ]);
    await db.prisma.emailSuppression.create({
      data: { emailHash: hashEmail(recipient.email), reason: "bounce" },
    });
    await startWorker();

    await requestConnection(actor.id, recipient.id);
    await requestConnection(actor.id, control.id); // proves the pipeline ran

    await eventually(async () =>
      expect(await notifications(recipient.id)).toHaveLength(1)
    );
    await eventually(() => expect(smtp.received).toHaveLength(1));
    await wait(300);
    expect(smtp.received.flatMap((m) => m.to)).toEqual([
      "control@example.test",
    ]);
    expect(await emailDeliveries(recipient.id)).toHaveLength(0);
  });

  // Fan-out correctness through the real Prisma lookups in compose.ts.
  describe("fan-out recipients (real lookups)", () => {
    const makeUserIn = (name: string, accountState = "VERIFIED" as const) =>
      db.prisma.user.create({
        data: {
          name,
          email: `${name}@example.test`,
          emailVerified: true,
          accountState,
        },
      });
    const block = (a: string, b: string) =>
      db.prisma.connection.create({
        data: {
          userAId: a < b ? a : b,
          userBId: a < b ? b : a,
          requestedById: a,
          blockedById: a,
          state: "BLOCKED",
        },
      });
    const emit = (type: string, payload: Record<string, unknown>) =>
      db.prisma.$transaction((tx) =>
        writer.add(tx, { type, payload: { v: 1, ...payload } } as never)
      );
    /** Waits for `expected` to be notified, then proves nobody else was. */
    const expectNotified = async (
      type: string,
      expected: string[],
      everyone: string[]
    ) => {
      const notifiedOf = async () =>
        (await db.prisma.notification.findMany({ where: { type } }))
          .map((n) => n.recipientId)
          .sort();
      await eventually(async () =>
        expect(await notifiedOf()).toEqual([...expected].sort())
      );
      await wait(300);
      expect(await notifiedOf()).toEqual([...expected].sort());
      expect(everyone.length).toBeGreaterThan(expected.length);
    };

    it("event.cancelled notifies every non-cancelled registrant except the actor and anyone blocked with them", async () => {
      const users = await Promise.all(
        ["org", "reg", "att", "noshow", "cancelled", "blocked"].map((n) =>
          makeUserIn(n)
        )
      );
      const [org, reg, att, noshow, cancelled, blocked] = users.map(
        (u) => u!.id
      ) as [string, string, string, string, string, string];
      const event = await db.prisma.event.create({
        data: {
          organizerId: org,
          title: "Meetup",
          description: "An alumni meetup.",
          startsAt: new Date(Date.now() + 86_400_000),
          timezone: "Asia/Kolkata",
          isOnline: true,
          capacity: 10,
          registrationDeadline: new Date(Date.now() + 3_600_000),
          status: "CANCELLED",
          cancelledAt: new Date(),
        },
      });
      await db.prisma.eventRegistration.createMany({
        data: [
          { eventId: event.id, userId: org, state: "REGISTERED" },
          { eventId: event.id, userId: reg, state: "REGISTERED" },
          { eventId: event.id, userId: att, state: "ATTENDED" },
          { eventId: event.id, userId: noshow, state: "NO_SHOW" },
          { eventId: event.id, userId: cancelled, state: "CANCELLED" },
          { eventId: event.id, userId: blocked, state: "REGISTERED" },
        ],
      });
      await block(blocked, org);
      await startWorker();

      await emit("event.cancelled", { eventId: event.id, actorId: org });

      await expectNotified(
        "event.cancelled",
        [reg, att, noshow],
        users.map((u) => u.id)
      );
    });

    it("report.filed notifies report.review holders by role or live grant, never expired, suspended or the reporter", async () => {
      const users = await Promise.all([
        makeUserIn("roleholder"),
        makeUserIn("granted"),
        makeUserIn("expired"),
        makeUserIn("suspended", "SUSPENDED" as never),
        makeUserIn("reporter"),
        makeUserIn("bystander"),
        makeUserIn("author"),
      ]);
      const [roleHolder, granted, expired, suspended, reporter, , author] =
        users.map((u) => u.id) as string[];
      const role = await db.prisma.role.create({
        data: {
          name: "test-moderator",
          rolePermissions: { create: { permission: "report.review" } },
        },
      });
      await db.prisma.userRole.createMany({
        data: [roleHolder!, suspended!, reporter!].map((userId) => ({
          userId,
          roleId: role.id,
          grantedBy: author!,
        })),
      });
      await db.prisma.permissionGrant.createMany({
        data: [
          { userId: granted!, expiresAt: null },
          { userId: expired!, expiresAt: new Date(Date.now() - 60_000) },
        ].map((g) => ({
          ...g,
          permission: "report.review",
          scopeType: "GLOBAL" as const,
          grantedBy: author!,
        })),
      });
      const post = await db.prisma.post.create({
        data: { authorId: author!, content: "x", imageUrls: [] },
      });
      const report = await db.prisma.report.create({
        data: {
          reporterId: reporter!,
          targetType: "POST",
          targetId: post.id,
          reason: "spam",
        },
      });
      await startWorker();

      await emit("report.filed", {
        reportId: report.id,
        targetType: "POST",
        targetId: post.id,
        reporterId: reporter,
      });

      await expectNotified(
        "report.filed",
        [roleHolder!, granted!],
        users.map((u) => u.id)
      );
    });

    it("comment.created notifies the post author and live prior commenters, never the commenter or a blocked pair", async () => {
      const users = await Promise.all(
        ["author", "prior", "deletedprior", "blockedprior", "commenter"].map(
          (n) => makeUserIn(n)
        )
      );
      const [author, prior, deletedPrior, blockedPrior, commenter] = users.map(
        (u) => u.id
      ) as [string, string, string, string, string];
      const post = await db.prisma.post.create({
        data: { authorId: author, content: "x", imageUrls: [] },
      });
      await db.prisma.comment.createMany({
        data: [
          { postId: post.id, authorId: prior, body: "a" },
          { postId: post.id, authorId: deletedPrior, body: "b", deleted: true },
          { postId: post.id, authorId: blockedPrior, body: "c" },
        ],
      });
      const comment = await db.prisma.comment.create({
        data: { postId: post.id, authorId: commenter, body: "new" },
      });
      await block(blockedPrior, commenter);
      await startWorker();

      await emit("comment.created", {
        commentId: comment.id,
        postId: post.id,
        authorId: commenter,
      });

      await expectNotified(
        "comment.created",
        [author, prior],
        users.map((u) => u.id)
      );
    });

    it("content.removed notifies the author of the soft-deleted post", async () => {
      const [author, other] = await Promise.all([
        makeUserIn("author"),
        makeUserIn("other"),
      ]);
      const post = await db.prisma.post.create({
        data: {
          authorId: author.id,
          content: "x",
          imageUrls: [],
          deleted: true,
        },
      });
      await startWorker();

      await emit("content.removed", {
        targetType: "POST",
        targetId: post.id,
        reportId: "55555555-5555-4555-8555-555555555555",
      });

      await expectNotified(
        "content.removed",
        [author.id],
        [author.id, other.id]
      );
    });
  });
});
