import { unreadCounterKey as key } from "@nitap/jobs";
import type { Redis } from "ioredis";

export type UnreadCounter = {
  increment(userId: string): Promise<void>;
};

// Increment only a key that already exists: the web seeds it from Postgres (with the TTL). Creating it here
// would store 1 while Postgres holds N unread, and the web's NX seed could not correct it for the TTL (spec N-9).
const INCR_IF_EXISTS = `if redis.call('EXISTS', KEYS[1]) == 1 then return redis.call('INCR', KEYS[1]) end return nil`;

export function createRedisUnreadCounter(
  redis: Pick<Redis, "eval">
): UnreadCounter {
  return {
    async increment(userId) {
      await redis.eval(INCR_IF_EXISTS, 1, key(userId));
    },
  };
}
