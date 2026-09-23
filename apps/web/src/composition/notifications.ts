import { prisma } from "@/infrastructure/database/client";
import { getRedis } from "@/infrastructure/redis/client";
import { authorize } from "@/modules/auth";
import {
  createNotificationUseCases,
  createRedisUnreadCounter,
  NOTIFICATION_DOMAINS,
  createPrismaNotificationStore,
} from "@/modules/notifications";

/** Wires the notifications module to PostgreSQL and the shared Redis unread counter (Redis-optional, N-9). */
const useCases = createNotificationUseCases({
  store: createPrismaNotificationStore(prisma),
  authorize,
  counter: createRedisUnreadCounter(getRedis),
  domains: NOTIFICATION_DOMAINS,
});

export const listNotifications = useCases.list;
export const markNotificationRead = useCases.markRead;
export const markAllNotificationsRead = useCases.markAllRead;
export const getUnreadCount = useCases.unreadCount;
export const getNotificationPreferences = useCases.getPreferences;
export const setNotificationPreference = useCases.setPreference;
