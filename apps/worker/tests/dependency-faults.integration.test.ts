import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createOutboxWriter } from "@nitap/database/outbox";
import { defineJob, emailSend } from "@nitap/jobs";
import { createFakeStoragePort } from "@nitap/storage";
import {
  createRedisNamespace,
  createTestDatabase,
  startFaultProxy,
  startSmtpTestServer,
  upstreamOf,
  withFault,
  type FaultProxy,
  type RedisNamespace,
  type SmtpTestServer,
  type TestDatabase,
} from "@nitap/testing";

import { composeWorker, type ComposedWorker } from "../src/compose.ts";
import { createPrismaClient } from "../src/prisma.ts";
import { recordingMetrics, silentLogger } from "./support.ts";

// The worker's production pool and queue Redis each go through a fault proxy, so the shipped timeouts
// are tested.
const fastEmailJob = defineJob({
  ...emailSend,
  retry: { attempts: 20, baseDelayMs: 40, maxDelayMs: 200, jitter: 0 },
});

const eventually = (
  assertion: () => unknown | Promise<unknown>,
  timeout = 15_000
) => vi.waitFor(assertion, { timeout, interval: 50 });
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("worker under dependency faults (real PostgreSQL, Redis and SMTP through fault proxies)", () => {
  let db: TestDatabase;
  let smtp: SmtpTestServer;
  let ns: RedisNamespace;
  let pgProxy: FaultProxy;
  let redisProxy: FaultProxy;
  let worker: ComposedWorker;
  let closePool: () => Promise<void>;
  const writer = createOutboxWriter({ requestId: () => "req-faults" });

  beforeEach(async () => {
    db = await createTestDatabase();
    smtp = await startSmtpTestServer();
    ns = await createRedisNamespace();
    pgProxy = await startFaultProxy({ upstream: upstreamOf(db.databaseUrl) });
    redisProxy = await startFaultProxy({ upstream: upstreamOf(ns.url) });

    const { prisma, pool } = createPrismaClient(pgProxy.url(db.databaseUrl));
    closePool = async () => {
      await prisma.$disconnect().catch(() => {});
      await pool.end().catch(() => {});
    };
    worker = composeWorker(
      {
        prisma,
        logger: silentLogger(),
        metrics: recordingMetrics(),
        storage: createFakeStoragePort(),
        config: {
          queueRedisUrl: redisProxy.url(ns.url),
          queuePrefix: ns.prefix,
          smtpUrl: smtp.url,
          emailFrom: "NITAP <no-reply@alumni.test>",
          appUrl: "https://alumni.example",
          emailRatePerSecond: 50,
        },
      },
      {
        emailJob: fastEmailJob,
        relay: { pollIntervalMs: 40 },
        smtp: {
          connectionTimeoutMs: 500,
          greetingTimeoutMs: 500,
          socketTimeoutMs: 500,
        },
      }
    );
    await worker.start();
  });

  afterEach(async () => {
    pgProxy.clear();
    redisProxy.clear();
    await worker.stop();
    await closePool();
    await pgProxy.close();
    await redisProxy.close();
    await smtp.close();
    await ns.cleanup();
    await db.drop();
  });

  const write = (to: string) =>
    db.prisma.$transaction((tx) =>
      writer.add(tx, {
        type: "email.send",
        payload: {
          v: 1,
          to,
          template: "verify-email",
          params: {
            verificationUrl: "https://alumni.example/verify?t=abc",
            expiresInMinutes: 60,
          },
        },
      })
    );
  const unpublished = () =>
    db.prisma.outboxEvent.count({ where: { publishedAt: null } });

  /** A readiness probe must answer within its own bound, whatever the dependency does. */
  async function probe() {
    const started = Date.now();
    const readiness = await worker.ready();
    return { readiness, ms: Date.now() - started };
  }

  it("PostgreSQL down: not ready, nothing relayed or lost, then the row is delivered exactly once without a restart", async () => {
    await withFault(pgProxy, "down", async () => {
      const { readiness, ms } = await probe();
      expect(readiness.ok).toBe(false);
      expect(readiness.checks.database).toBe(false);
      expect(ms).toBeLessThan(2_500);

      await write("ada@example.test");
      await wait(1_000);
      expect(smtp.received).toHaveLength(0);
      expect(await unpublished()).toBe(1);
    });

    await eventually(() => expect(smtp.received).toHaveLength(1));
    await eventually(async () => expect(await unpublished()).toBe(0));
    await wait(300);
    expect(smtp.received).toHaveLength(1);
    await eventually(async () => expect((await worker.ready()).ok).toBe(true));
  }, 30_000);

  it("PostgreSQL stalled: the readiness probe still answers within its bound (not ready)", async () => {
    await withFault(pgProxy, "stall", async () => {
      const { readiness, ms } = await probe();
      expect(readiness.checks.database).toBe(false);
      expect(readiness.ok).toBe(false);
      expect(ms).toBeLessThan(2_500);
    });
  }, 30_000);

  it("queue Redis down: not ready, the outbox holds the event, then it is delivered exactly once", async () => {
    await withFault(redisProxy, "down", async () => {
      const { readiness, ms } = await probe();
      expect(readiness.checks.queueRedis).toBe(false);
      expect(ms).toBeLessThan(2_500);

      await write("bo@example.test");
      await wait(1_000);
      expect(await unpublished()).toBe(1);
      expect(smtp.received).toHaveLength(0);
    });

    await eventually(() => expect(smtp.received).toHaveLength(1));
    await eventually(async () => expect(await unpublished()).toBe(0));
    await wait(300);
    expect(smtp.received).toHaveLength(1);
  }, 30_000);

  it("queue Redis stalled: the readiness probe answers within its bound; nothing is lost or doubled after", async () => {
    await withFault(redisProxy, "stall", async () => {
      const { readiness, ms } = await probe();
      expect(readiness.checks.queueRedis).toBe(false);
      expect(ms).toBeLessThan(2_500);
      await write("cy@example.test");
      await wait(1_000);
      expect(smtp.received).toHaveLength(0);
    });

    await eventually(() => expect(smtp.received).toHaveLength(1));
    await wait(500);
    expect(smtp.received).toHaveLength(1);
  }, 40_000);

  it("SMTP hanging (slow, not dead): each attempt times out instead of holding the job, and the email goes once SMTP answers", async () => {
    smtp.setMode("hang");
    await write("di@example.test");
    // Several bounded attempts happen while it hangs.
    await wait(2_000);
    expect(smtp.received).toHaveLength(0);

    smtp.setMode("accept");
    await eventually(() => expect(smtp.received).toHaveLength(1));
    await wait(500);
    expect(smtp.received).toHaveLength(1);
  }, 30_000);
});
