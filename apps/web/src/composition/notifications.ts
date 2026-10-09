import { createQueueAdmin, type QueueAdmin } from "@nitap/queue";

import { env } from "@/config/env";
import { audit } from "@/infrastructure/audit";
import { prisma, transactionRunner } from "@/infrastructure/database/client";
import { captureError, logger } from "@/infrastructure/observability";
import { getRedis } from "@/infrastructure/redis/client";
import { authorize } from "@/modules/auth";
import {
  createNotificationUseCases,
  createReplayNotifications,
  createListFailedDeliveries,
  createRedisUnreadCounter,
  NOTIFICATION_DOMAINS,
  createPrismaNotificationStore,
} from "@/modules/notifications";

/** Wires the notifications module to PostgreSQL and the shared Redis unread counter (Redis-optional). */
const store = createPrismaNotificationStore(prisma);
const useCases = createNotificationUseCases({
  store,
  authorize,
  counter: createRedisUnreadCounter(getRedis),
  domains: NOTIFICATION_DOMAINS,
});

export const authorizeNotifications = useCases.check;
export const listNotifications = useCases.list;
export const markNotificationRead = useCases.markRead;
export const markAllNotificationsRead = useCases.markAllRead;
export const getUnreadCount = useCases.unreadCount;
export const getNotificationPreferences = useCases.getPreferences;
export const setNotificationPreference = useCases.setPreference;

/** The queue Redis (noeviction) is a different server from the cache Redis; connect on first use only. */
let queueAdmin: QueueAdmin | undefined;
const replayUseCases = createReplayNotifications({
  authorize,
  failedEmailJobId: store.failedEmailJobId,
  queueAdmin: () => {
    const url = env.QUEUE_REDIS_URL;
    if (!url) throw new Error("QUEUE_REDIS_URL is not set");
    return (queueAdmin ??= createQueueAdmin({ url }));
  },
  audit: (entry) => transactionRunner.run((tx) => audit.record(tx, entry)),
  onAuditFailed: (error, metadata) => {
    logger.error("notification.replay.audit_failed", { error, metadata });
    captureError(error, {
      tags: { action: "notification.replay" },
      extra: metadata,
    });
  },
});

export const authorizeNotificationReplay = replayUseCases.check;
export const replayNotifications = replayUseCases.replay;

export const listFailedDeliveries = createListFailedDeliveries({
  store,
  authorize,
  now: () => new Date(),
});
