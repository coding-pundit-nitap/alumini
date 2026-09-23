/** The Redis key holding a user's unread-notification counter: worker (incr) and web (get/decr) share it. */
export const unreadCounterKey = (userId: string) => `notif:unread:${userId}`;
