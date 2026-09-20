import { Redis } from "ioredis";

import type { PrismaClient } from "@nitap/database";
import { createOutboxStore } from "@nitap/database/outbox";
import { createSmtpEmailPort } from "@nitap/email";
import { emailSend, outboxPrune } from "@nitap/jobs";
import type { EmailSendPayload, JobDefinition } from "@nitap/jobs";
import {
  createBullQueuePort,
  createRelay,
  createWorkerRuntime,
  registerJob,
} from "@nitap/queue";
import type { QueuePort, Relay, WorkerRuntime } from "@nitap/queue";
import type { Logger, Metrics } from "@nitap/observability";

import type { Readiness } from "./health.ts";
import { createEmailSendProcessor } from "./processors/email-send.ts";
import { createOutboxPruneProcessor } from "./processors/outbox-prune.ts";

export type WorkerConfig = {
  queueRedisUrl: string;
  smtpUrl: string;
  emailFrom: string;
  emailRatePerSecond: number;
  /** BullMQ key prefix; tests use a unique one. */
  queuePrefix?: string;
};

export type ComposeOverrides = {
  /** Tests use a copy of the definition with millisecond retries. */
  emailJob?: JobDefinition<string, EmailSendPayload>;
  /** Tests wrap the queue to simulate a Redis outage. */
  wrapQueue?: (queue: QueuePort) => QueuePort;
  relay?: {
    pollIntervalMs?: number;
    batchSize?: number;
    enqueueTimeoutMs?: number;
  };
  smtp?: {
    connectionTimeoutMs?: number;
    greetingTimeoutMs?: number;
    socketTimeoutMs?: number;
  };
  unknownVersionDelayMs?: number;
};

export type ComposedWorker = {
  start(): Promise<void>;
  /** Stops the relay first (no new work), then drains in-flight jobs, then closes connections. */
  stop(): Promise<void>;
  ready(): Promise<Readiness>;
  relay: Relay;
  runtime: WorkerRuntime;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The only place that builds concrete adapters and hands them to the relay and the processors (strategy
 * §2.3 rule 5). The caller owns the Prisma client.
 */
export function composeWorker(
  deps: {
    prisma: PrismaClient;
    config: WorkerConfig;
    logger: Logger;
    metrics: Metrics;
  },
  overrides: ComposeOverrides = {}
): ComposedWorker {
  const { prisma, config, logger, metrics } = deps;
  const emailJob = overrides.emailJob ?? emailSend;
  const pollIntervalMs = overrides.relay?.pollIntervalMs ?? 1_000;

  const store = createOutboxStore(prisma);
  const email = createSmtpEmailPort({
    url: config.smtpUrl,
    from: config.emailFrom,
    ...overrides.smtp,
  });
  const rawQueue = createBullQueuePort({
    url: config.queueRedisUrl,
    prefix: config.queuePrefix,
    onError: (error) => logger.error("queue.redis.error", { error }),
  });
  const queue = overrides.wrapQueue ? overrides.wrapQueue(rawQueue) : rawQueue;
  const ping = new Redis(config.queueRedisUrl, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
  });
  ping.on("error", () => {});

  const relay = createRelay({
    store,
    queue,
    events: { [emailJob.name]: emailJob },
    logger,
    metrics,
    ...overrides.relay,
  });
  const runtime = createWorkerRuntime({
    redisUrl: config.queueRedisUrl,
    prefix: config.queuePrefix,
    logger,
    metrics,
    jobs: [
      registerJob(emailJob, createEmailSendProcessor(email)),
      registerJob(outboxPrune, createOutboxPruneProcessor(store)),
    ],
    queueOverrides: {
      email: {
        rateLimit: { max: config.emailRatePerSecond, durationMs: 1_000 },
      },
    },
    unknownVersionDelayMs: overrides.unknownVersionDelayMs,
  });

  let startedAt: number | null = null;

  return {
    relay,
    runtime,

    async start() {
      startedAt = Date.now();
      // Fixed id: every worker upserts the same schedule, so N workers never multiply it.
      await rawQueue.upsertSchedule(outboxPrune, {
        id: "outbox-prune",
        everyMs: DAY_MS,
        payload: { v: 1 },
      });
      await runtime.start();
      relay.start();
    },

    async stop() {
      await relay.stop();
      await runtime.close({ timeoutMs: 30_000 });
      await rawQueue.close();
      email.close();
      ping.disconnect();
    },

    async ready() {
      const [database, queueRedis] = await Promise.all([
        prisma.$queryRaw`SELECT 1`.then(
          () => true,
          () => false
        ),
        (async () => {
          if (ping.status === "wait") await ping.connect();
          return (await ping.ping()) === "PONG";
        })().catch(() => false),
      ]);
      const { lastPollAt } = relay.health();
      const stale = Math.max(15_000, pollIntervalMs * 5);
      const starting = startedAt !== null && Date.now() - startedAt < 30_000;
      const relayOk =
        lastPollAt !== null
          ? Date.now() - lastPollAt.getTime() < stale
          : starting;
      const draining = runtime.health().draining;
      return {
        ok: database && queueRedis && relayOk && !draining,
        checks: { database, queueRedis, relay: relayOk, draining },
      };
    },
  };
}
