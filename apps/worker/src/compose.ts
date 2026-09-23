import { Redis } from "ioredis";

import type { PrismaClient } from "@nitap/database";
import { createJobExpireStore } from "@nitap/database/jobs";
import { createOutboxStore, createOutboxWriter } from "@nitap/database/outbox";
import { createIdempotencyStore } from "@nitap/database/idempotency";
import { createNotificationRetentionStore } from "@nitap/database/notifications";
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
  eventJobs,
  idempotencySweep,
  jobEvents,
  jobExpire,
  jobExpired,
  mentorshipJobs,
  messageSent,
  notificationRetentionSweep,
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
  EventLifecyclePayload,
  EventRegistrationPayload,
  JobDefinition,
  JobEventPayload,
  JobExpiredPayload,
  JobPublishedPayload,
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

import {
  createNotificationHintPublisher,
  createRedisHintPublisher,
} from "./hints.ts";
import { createDeliverNotification } from "./notifications/deliver.ts";
import {
  createPrismaDeliveryStore,
  getPreference,
} from "./notifications/prisma-delivery-store.ts";
import { createRedisMessageDebounce } from "./notifications/message-debounce.ts";
import { createRedisUnreadCounter } from "./notifications/unread-counter.ts";
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
import { createJobEventProcessor } from "./processors/job-event.ts";
import { createJobExpireProcessor } from "./processors/job-expire.ts";
import { createEventActivityProcessor } from "./processors/event-activity.ts";
import { createMentorshipEventProcessor } from "./processors/mentorship-event.ts";
import { createMessageSentProcessor } from "./processors/message-sent.ts";
import { createNotificationRetentionSweepProcessor } from "./processors/notification-retention-sweep.ts";
import { createOutboxPruneProcessor } from "./processors/outbox-prune.ts";
import { createUploadScanProcessor } from "./processors/upload-scan.ts";
import { createUploadSweepProcessor } from "./processors/upload-sweep.ts";
import { passthroughScanner } from "./scanner.ts";

export type WorkerConfig = {
  queueRedisUrl: string;
  cacheRedisUrl?: string;
  smtpUrl: string;
  emailFrom: string;
  /** Public web origin, the base of the links in notification emails. */
  appUrl: string;
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
  const notificationRetention = createNotificationRetentionStore();
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

  const deliveryStore = createPrismaDeliveryStore(prisma);
  // The one fan-out-to-a-recipient primitive; later notification processors reuse it.
  const deliver = createDeliverNotification({
    store: deliveryStore,
    getPreference: getPreference(prisma),
    appUrl: config.appUrl,
    enqueueEmail: (payload, options) => queue.add(emailJob, payload, options),
    hintPublisher: hintRedis
      ? createNotificationHintPublisher(hintRedis)
      : null,
    unreadCounter: hintRedis
      ? createRedisUnreadCounter(hintRedis)
      : {
          increment: async () => {},
          decrement: async () => {},
          get: async () => null,
        },
    logger,
  });
  /** Current email of a VERIFIED account; null for anything else (no mail to suspended/deactivated users). */
  const findEmail = async (userId: string) =>
    (
      await prisma.user.findFirst({
        where: { id: userId, accountState: "VERIFIED" },
        select: { email: true },
      })
    )?.email ?? null;
  /** Symmetric block check (either party may have blocked); pairs are stored ordered, userAId < userBId. */
  const blocked = async (a: string, b: string) =>
    (await prisma.connection.count({
      where: {
        state: "BLOCKED",
        userAId: a < b ? a : b,
        userBId: a < b ? b : a,
      },
    })) > 0;
  const findActiveRegistrants = async (eventId: string) =>
    (
      await prisma.eventRegistration.findMany({
        where: { eventId, state: { not: "CANCELLED" } },
        select: { userId: true },
        orderBy: { id: "asc" },
      })
    ).map((row) => row.userId);
  // ponytail: CHAPTER-scoped grants count as reviewers too (no chapter filter); narrow when review is chapter-scoped.
  const findModerators = async (
    permission: "job.approve" | "achievement.review" | "report.review"
  ) => {
    const now = new Date();
    const [viaRole, viaGrant] = await Promise.all([
      prisma.userRole.findMany({
        where: {
          role: { rolePermissions: { some: { permission } } },
          user: { accountState: "VERIFIED" },
        },
        select: { userId: true },
      }),
      prisma.permissionGrant.findMany({
        where: {
          permission,
          user: { accountState: "VERIFIED" },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: { userId: true },
      }),
    ]);
    return [...new Set([...viaRole, ...viaGrant].map((r) => r.userId))];
  };

  const findPostAuthor = async (postId: string) =>
    (
      await prisma.post.findFirst({
        where: { id: postId, deleted: false },
        select: { authorId: true },
      })
    )?.authorId ?? null;
  // ponytail: first 200 distinct prior commenters (by id); raise or chunk if threads outgrow it.
  const findPriorCommenters = async (postId: string, excludeUserId: string) =>
    (
      await prisma.comment.findMany({
        where: { postId, deleted: false, authorId: { not: excludeUserId } },
        select: { authorId: true },
        distinct: ["authorId"],
        orderBy: { authorId: "asc" },
        take: 200,
      })
    ).map((row) => row.authorId);
  const commentIsLive = async (commentId: string) =>
    (await prisma.comment.count({ where: { id: commentId, deleted: false } })) >
    0;
  const achievementExists = async (id: string) =>
    (await prisma.achievement.count({ where: { id } })) > 0;
  const reportExists = async (id: string) =>
    (await prisma.report.count({ where: { id } })) > 0;
  const findReporter = async (reportId: string) =>
    (
      await prisma.report.findUnique({
        where: { id: reportId },
        select: { reporterId: true },
      })
    )?.reporterId ?? null;
  // Deliberately no `deleted` filter: content.removed fires after the soft-delete.
  const findContentAuthor = async (
    targetType: "POST" | "COMMENT",
    targetId: string
  ) =>
    (
      await (targetType === "POST"
        ? prisma.post.findUnique({
            where: { id: targetId },
            select: { authorId: true },
          })
        : prisma.comment.findUnique({
            where: { id: targetId },
            select: { authorId: true },
          }))
    )?.authorId ?? null;

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
      [jobExpired.name]: jobExpired,
      ...Object.fromEntries(
        Object.values(jobEvents).map((job) => [job.name, job])
      ),
      ...Object.fromEntries(
        Object.values(mentorshipJobs).map((job) => [job.name, job])
      ),
      ...Object.fromEntries(
        Object.values(eventJobs).map((job) => [job.name, job])
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
      registerJob(
        emailJob,
        createEmailSendProcessor(email, {
          deliveries: deliveryStore,
          metrics,
          maxAttempts: emailJob.retry.attempts,
        })
      ),
      registerJob(outboxPrune, createOutboxPruneProcessor(store)),
      registerJob(
        connectionRequested,
        createConnectionEventProcessor("requested", {
          deliver,
          findEmail,
          blocked,
        })
      ),
      registerJob(
        connectionAccepted,
        createConnectionEventProcessor("accepted", {
          deliver,
          findEmail,
          blocked,
        })
      ),
      registerJob(postCreated, createPostCreatedProcessor()),
      registerJob(
        commentCreated,
        createCommentCreatedProcessor({
          deliver,
          findEmail,
          findPostAuthor,
          findPriorCommenters,
          commentIsLive,
          blocked,
        })
      ),
      registerJob(reactionAdded, createReactionAddedProcessor()),
      registerJob(
        achievementSubmitted,
        createAchievementSubmittedProcessor({
          deliver,
          findEmail,
          findModerators,
          achievementExists,
        })
      ),
      registerJob(
        achievementApproved,
        createAchievementApprovedProcessor({
          deliver,
          findEmail,
          achievementExists,
        })
      ),
      registerJob(
        achievementRejected,
        createAchievementRejectedProcessor({
          deliver,
          findEmail,
          achievementExists,
        })
      ),
      registerJob(
        reportFiled,
        createReportFiledProcessor({
          deliver,
          findEmail,
          findModerators,
          reportExists,
        })
      ),
      registerJob(
        reportResolved,
        createReportResolvedProcessor({ deliver, findEmail, findReporter })
      ),
      registerJob(
        contentRemoved,
        createContentRemovedProcessor({ deliver, findEmail, findContentAuthor })
      ),
      ...[...Object.values(jobEvents), jobExpired].map((job) =>
        registerJob(
          job as JobDefinition<
            string,
            JobEventPayload | JobPublishedPayload | JobExpiredPayload
          >,
          createJobEventProcessor(job.name.slice("job.".length) as never, {
            deliver,
            findEmail,
            findModerators,
          })
        )
      ),
      ...Object.values(mentorshipJobs).map((job) =>
        registerJob(
          job,
          createMentorshipEventProcessor(job.name.slice("mentorship.".length), {
            deliver,
            findEmail,
            blocked,
          })
        )
      ),
      ...Object.values(eventJobs).map((job) =>
        registerJob(
          job as JobDefinition<
            string,
            EventLifecyclePayload | EventRegistrationPayload
          >,
          createEventActivityProcessor(job.name.slice("event.".length), {
            deliver,
            findEmail,
            findActiveRegistrants,
            blocked,
          })
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
          deliver,
          findEmail,
          blocked,
          debounce: hintRedis ? createRedisMessageDebounce(hintRedis) : null,
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
        notificationRetentionSweep,
        createNotificationRetentionSweepProcessor({
          sweep: (before, limit) =>
            notificationRetention.sweep(prisma, before, limit),
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
      await rawQueue.upsertSchedule(notificationRetentionSweep, {
        id: "notification-retention-sweep",
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
