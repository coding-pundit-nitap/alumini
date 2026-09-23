import { Redis } from "ioredis";

import type { PrismaClient } from "@nitap/database";
import { createJobExpireStore } from "@nitap/database/jobs";
import { createOutboxStore, createOutboxWriter } from "@nitap/database/outbox";
import { createIdempotencyStore } from "@nitap/database/idempotency";
import { createUploadStore } from "@nitap/database/uploads";
import { createSmtpEmailPort } from "@nitap/email";
import {
  achievementApproved,
  achievementRejected,
  achievementSubmitted,
  commentCreated,
  connectionAccepted,
  connectionRequested,
  contentRemoved,
  emailSend,
  idempotencySweep,
  jobExpire,
  mentorshipJobs,
  messageSent,
  outboxPrune,
  postCreated,
  reactionAdded,
  reportFiled,
  reportResolved,
  uploadScan,
  uploadSweep,
} from "@nitap/jobs";
import type {
  EmailSendPayload,
  JobDefinition,
  UploadScanPayload,
} from "@nitap/jobs";
import {
  createBullQueuePort,
  createRelay,
  createWorkerRuntime,
  registerJob,
} from "@nitap/queue";
import type { QueuePort, Relay, WorkerRuntime } from "@nitap/queue";
import type { Logger, Metrics } from "@nitap/observability";
import type { StoragePort } from "@nitap/storage";

import { createRedisHintPublisher } from "./hints.ts";
import type { Readiness } from "./health.ts";
import {
  createAchievementApprovedProcessor,
  createAchievementRejectedProcessor,
  createAchievementSubmittedProcessor,
  createCommentCreatedProcessor,
  createContentRemovedProcessor,
  createPostCreatedProcessor,
  createReactionAddedProcessor,
  createReportFiledProcessor,
  createReportResolvedProcessor,
} from "./processors/community-event.ts";
import { createConnectionEventProcessor } from "./processors/connection-event.ts";
import { createIdempotencySweepProcessor } from "./processors/idempotency-sweep.ts";
import { createEmailSendProcessor } from "./processors/email-send.ts";
import { createJobExpireProcessor } from "./processors/job-expire.ts";
import { createMentorshipEventProcessor } from "./processors/mentorship-event.ts";
import { createMessageSentProcessor } from "./processors/message-sent.ts";
import { createOutboxPruneProcessor } from "./processors/outbox-prune.ts";
import { createUploadScanProcessor } from "./processors/upload-scan.ts";
import { createUploadSweepProcessor } from "./processors/upload-sweep.ts";
import { passthroughScanner } from "./scanner.ts";

export type WorkerConfig = {
  queueRedisUrl: string;
  cacheRedisUrl?: string;
  smtpUrl: string;
  emailFrom: string;
  emailRatePerSecond: number;
  /** BullMQ key prefix; tests use a unique one. */
  queuePrefix?: string;
};

export type ComposeOverrides = {
  /** Tests use a copy of the definition with millisecond retries. */
  emailJob?: JobDefinition<string, EmailSendPayload>;
  /** Tests use a copy of the definition with millisecond retries. */
  uploadScanJob?: JobDefinition<string, UploadScanPayload>;
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
    storage: StoragePort;
  },
  overrides: ComposeOverrides = {}
): ComposedWorker {
  const { prisma, config, logger, metrics, storage } = deps;
  const emailJob = overrides.emailJob ?? emailSend;
  const uploadScanJob = overrides.uploadScanJob ?? uploadScan;
  const pollIntervalMs = overrides.relay?.pollIntervalMs ?? 1_000;

  const store = createOutboxStore(prisma);
  const outboxWriter = createOutboxWriter();
  const jobExpireStore = createJobExpireStore({ prisma, outbox: outboxWriter });
  const uploads = createUploadStore();
  const idempotency = createIdempotencyStore();
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
  const hintRedis = config.cacheRedisUrl
    ? new Redis(config.cacheRedisUrl, {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      })
    : null;
  hintRedis?.on("error", (error) =>
    logger.warn("hint.redis.error", { metadata: { message: error.message } })
  );

  const relay = createRelay({
    store,
    queue,
    events: {
      [emailJob.name]: emailJob,
      [uploadScanJob.name]: uploadScanJob,
      [connectionRequested.name]: connectionRequested,
      [connectionAccepted.name]: connectionAccepted,
      [messageSent.name]: messageSent,
      [postCreated.name]: postCreated,
      [commentCreated.name]: commentCreated,
      [reactionAdded.name]: reactionAdded,
      [achievementSubmitted.name]: achievementSubmitted,
      [achievementApproved.name]: achievementApproved,
      [achievementRejected.name]: achievementRejected,
      [reportFiled.name]: reportFiled,
      [reportResolved.name]: reportResolved,
      [contentRemoved.name]: contentRemoved,
      ...Object.fromEntries(
        Object.values(mentorshipJobs).map((job) => [job.name, job])
      ),
    },
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
      registerJob(
        connectionRequested,
        createConnectionEventProcessor("requested")
      ),
      registerJob(
        connectionAccepted,
        createConnectionEventProcessor("accepted")
      ),
      registerJob(postCreated, createPostCreatedProcessor()),
      registerJob(commentCreated, createCommentCreatedProcessor()),
      registerJob(reactionAdded, createReactionAddedProcessor()),
      registerJob(achievementSubmitted, createAchievementSubmittedProcessor()),
      registerJob(achievementApproved, createAchievementApprovedProcessor()),
      registerJob(achievementRejected, createAchievementRejectedProcessor()),
      registerJob(reportFiled, createReportFiledProcessor()),
      registerJob(reportResolved, createReportResolvedProcessor()),
      registerJob(contentRemoved, createContentRemovedProcessor()),
      ...Object.values(mentorshipJobs).map((job) =>
        registerJob(
          job,
          createMentorshipEventProcessor(job.name.slice("mentorship.".length))
        )
      ),
      registerJob(
        messageSent,
        createMessageSentProcessor({
          participants: async (conversationId) =>
            (
              await prisma.conversationParticipant.findMany({
                where: { conversationId },
                select: { userId: true },
              })
            ).map((row) => row.userId),
          publisher: hintRedis ? createRedisHintPublisher(hintRedis) : null,
        })
      ),
      registerJob(
        uploadScanJob,
        createUploadScanProcessor({
          store: {
            find: (id) => uploads.find(prisma, id),
            markReady: (id, key) => uploads.markReady(prisma, id, key),
            markRejected: (id, reason) =>
              uploads.markRejected(prisma, id, reason),
          },
          storage,
          scanner: passthroughScanner,
        })
      ),
      registerJob(
        idempotencySweep,
        createIdempotencySweepProcessor({
          sweep: (before, limit) => idempotency.sweep(prisma, before, limit),
        })
      ),
      registerJob(
        uploadSweep,
        createUploadSweepProcessor({
          store: {
            listExpiredPending: (before, limit) =>
              uploads.listExpiredPending(prisma, before, limit),
            remove: (id) => uploads.remove(prisma, id),
          },
          storage,
        })
      ),
      registerJob(
        jobExpire,
        createJobExpireProcessor({ store: jobExpireStore })
      ),
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
      await rawQueue.upsertSchedule(idempotencySweep, {
        id: "idempotency-sweep",
        everyMs: DAY_MS,
        payload: { v: 1 },
      });
      await rawQueue.upsertSchedule(uploadSweep, {
        id: "upload-sweep",
        everyMs: DAY_MS,
        payload: { v: 1 },
      });
      await rawQueue.upsertSchedule(jobExpire, {
        id: "job-expire",
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
      hintRedis?.disconnect();
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
