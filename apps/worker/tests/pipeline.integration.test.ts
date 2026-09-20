import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createOutboxWriter } from "@nitap/database/outbox";
import { defineJob, emailSend } from "@nitap/jobs";
import { createQueueAdmin } from "@nitap/queue";
import type { QueuePort } from "@nitap/queue";
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

// Same contract as production, but with millisecond retries so the tests do not wait for real backoff.
const fastEmailJob = defineJob({
  ...emailSend,
  retry: { attempts: 6, baseDelayMs: 40, maxDelayMs: 120, jitter: 0 },
});

const eventually = (assertion: () => unknown | Promise<unknown>) =>
  vi.waitFor(assertion, { timeout: 10_000, interval: 25 });
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("outbox → relay → queue → worker → SMTP (real PostgreSQL, Redis and SMTP)", () => {
  let db: TestDatabase;
  let smtp: SmtpTestServer;
  let ns: RedisNamespace;
  const workers: ComposedWorker[] = [];
  const writer = createOutboxWriter({ requestId: () => "req-pipeline" });

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
        config: {
          queueRedisUrl: ns.url,
          queuePrefix: ns.prefix,
          smtpUrl: smtp.url,
          emailFrom: "NITAP <no-reply@alumni.test>",
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

  const emailEvent = (to: string) => ({
    type: "email.send" as const,
    payload: {
      v: 1 as const,
      to,
      template: "verify-email" as const,
      params: {
        verificationUrl: "https://alumni.example/verify?t=abc",
        expiresInMinutes: 60,
      },
    },
  });
  const write = (to: string) =>
    db.prisma.$transaction((tx) => writer.add(tx, emailEvent(to)));
  const admin = () => createQueueAdmin({ url: ns.url, prefix: ns.prefix });

  it("delivers an email written in a transaction, and marks the outbox row published", async () => {
    await startWorker();

    const { id } = await write("ada@example.test");

    await eventually(() => expect(smtp.received).toHaveLength(1));
    const mail = smtp.received[0]!;
    expect(mail.to).toEqual(["ada@example.test"]);
    expect(mail.raw).toContain(
      "Subject: Verify your email for the NITAP Alumni Network"
    );
    expect(mail.raw).toContain(`<${id}@nitap.invalid>`);
    await eventually(async () =>
      expect(
        (await db.prisma.outboxEvent.findUniqueOrThrow({ where: { id } }))
          .publishedAt
      ).not.toBeNull()
    );
  });

  it("keeps retrying while SMTP is down and delivers when it comes back", async () => {
    smtp.setMode("reject-transient");
    await startWorker();

    await write("ada@example.test");
    await wait(500);
    expect(smtp.received).toHaveLength(0); // still trying, nothing lost

    smtp.setMode("accept");
    await eventually(() => expect(smtp.received).toHaveLength(1));
  });

  it("dead-letters a permanently rejected email after one attempt and alerts", async () => {
    smtp.setMode("reject-permanent");
    const { metrics } = await startWorker();

    await write("nobody@example.test");

    await eventually(() =>
      expect(metrics.increment).toHaveBeenCalledWith("jobs_dead_total", {
        queue: "email",
        job: "email.send",
      })
    );
    expect(smtp.received).toHaveLength(0);
    const a = admin();
    try {
      expect(await a.listFailed("email", 10)).toHaveLength(1);
    } finally {
      await a.close();
    }
  });

  it("loses nothing when the queue Redis is down: rows stay unpublished, then drain", async () => {
    let redisDown = true;
    await startWorker((queue) => ({
      ...queue,
      add: async (...args) => {
        if (redisDown) throw new Error("redis unreachable");
        return queue.add(...args);
      },
    }));

    const { id } = await write("ada@example.test");
    await wait(500);
    expect(smtp.received).toHaveLength(0);
    expect(
      (await db.prisma.outboxEvent.findUniqueOrThrow({ where: { id } }))
        .publishedAt
    ).toBeNull();

    redisDown = false; // Redis is back
    await eventually(() => expect(smtp.received).toHaveLength(1));
    await eventually(async () =>
      expect(
        (await db.prisma.outboxEvent.findUniqueOrThrow({ where: { id } }))
          .publishedAt
      ).not.toBeNull()
    );
  });

  it("two workers together send each email exactly once", async () => {
    await startWorker();
    await startWorker();

    const recipients = Array.from(
      { length: 10 },
      (_, i) => `user${i}@example.test`
    );
    for (const to of recipients) await write(to);

    await eventually(() => expect(smtp.received).toHaveLength(10));
    await wait(300);
    expect(smtp.received).toHaveLength(10);
    expect(new Set(smtp.received.flatMap((m) => m.to))).toEqual(
      new Set(recipients)
    );
  });

  it("leaves an event of an unknown type for a newer worker, and quarantines a poison payload, while others flow", async () => {
    await startWorker();
    const future = await db.prisma.outboxEvent.create({
      data: { type: "future.thing", payload: { v: 1 } },
    });
    const poison = await db.prisma.outboxEvent.create({
      data: { type: "email.send", payload: {} },
    });

    await write("ada@example.test");

    await eventually(() => expect(smtp.received).toHaveLength(1));
    await eventually(async () =>
      expect(
        (
          await db.prisma.outboxEvent.findUniqueOrThrow({
            where: { id: poison.id },
          })
        ).failedAt
      ).not.toBeNull()
    );
    const untouched = await db.prisma.outboxEvent.findUniqueOrThrow({
      where: { id: future.id },
    });
    expect(untouched.publishedAt).toBeNull();
    expect(untouched.failedAt).toBeNull();
  });

  it("reports ready while running and not ready once draining", async () => {
    const { worker } = await startWorker();
    await eventually(async () => expect((await worker.ready()).ok).toBe(true));

    const stopping = worker.stop();
    await stopping;

    const after = await worker.ready();
    expect(after.checks.draining).toBe(true);
    expect(after.ok).toBe(false);
  });
});
