/** Public API of the notifications module. Other code imports from here, never from the module's internals. */
export { createNotificationUseCases } from "./application/notification-use-cases";
export type { UnreadCounter } from "./application/notification-use-cases";
export { NOTIFICATION_DOMAINS } from "./infrastructure/notification-domains";
export { createPrismaNotificationStore } from "./infrastructure/prisma-notification-store";
export { createRedisUnreadCounter } from "./infrastructure/redis-unread-counter";
