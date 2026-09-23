import { unreadCounterKey as key } from "@nitap/jobs";
import type { Redis } from "ioredis";

export type UnreadCounter = {
  increment(userId: string): Promise<void>;
  decrement(userId: string, by?: number): Promise<void>;
  get(userId: string): Promise<number | null>;
};

/** Redis is an optimisation; a null `get()` means "recompute from Postgres" (spec N-9). */
export function createRedisUnreadCounter(
  redis: Pick<Redis, "incr" | "decrby" | "get">
): UnreadCounter {
  return {
    async increment(userId) {
      await redis.incr(key(userId));
    },
    async decrement(userId, by = 1) {
      await redis.decrby(key(userId), by);
    },
    async get(userId) {
      const value = await redis.get(key(userId));
      return value === null ? null : Number(value);
    },
  };
}
