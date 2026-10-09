/**
 * The Redis key holding a user's unread-notification counter: worker (incr) and
 * web (get/decr) share it.
 */
export const unreadCounterKey = (userId: string) => `notif:unread:${userId}`;

/**
 * Seconds an unread counter may live untouched: Postgres corrects any drift
 * within this window.
 */
export const UNREAD_COUNTER_TTL_SECONDS = 300;
