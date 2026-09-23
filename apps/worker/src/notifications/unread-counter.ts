import {
  UNREAD_COUNTER_TTL_SECONDS,
  unreadCounterKey as key,
} from "@nitap/jobs";
import type { Redis } from "ioredis";

export type UnreadCounter = {
  increment(userId: string): Promise<void>;
  decrement(userId: string, by?: number): Promise<void>;
  get(userId: string): Promise<number | null>;
};

/** Redis is an optimisation; a null `get()` means "recompute from Postgres" (spec N-9). */
export function createRedisUnreadCounter(
  redis: Pick<Redis, "multi" | "decrby" | "del" | "get">
): UnreadCounter {
  return {
    async increment(userId) {
      // One round trip; EXPIRE NX gives a fresh key a TTL without extending a live one, so drift is bounded.
      await redis
        .multi()
        .incr(key(userId))
        .expire(key(userId), UNREAD_COUNTER_TTL_SECONDS, "NX")
        .exec();
    },
    async decrement(userId, by = 1) {
      // A decrement on a missing key would leave a negative, TTL-less key behind: drop it (recomputed from Postgres).
      const left = await redis.decrby(key(userId), by);
      if (left < 0) await redis.del(key(userId));
    },
    async get(userId) {
      const value = await redis.get(key(userId));
      return value === null ? null : Number(value);
    },
  };
}
