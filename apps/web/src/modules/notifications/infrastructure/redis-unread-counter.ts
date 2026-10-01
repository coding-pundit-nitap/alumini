import { UNREAD_COUNTER_TTL_SECONDS, unreadCounterKey } from "@nitap/jobs";

import { getMetrics, logger } from "@/infrastructure/observability";
import type { UnreadCounter } from "../application/notification-use-cases";

type RedisLike = {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    ex: "EX",
    seconds: number,
    nx: "NX"
  ): Promise<unknown>;
  decrby(key: string, by: number): Promise<number>;
  del(key: string): Promise<unknown>;
};

/**
 * Web side of the worker's counter (same key). `getRedis` fails fast (250ms, offline queue off), so a
 * caught error means "Redis down": reads return null (recompute from Postgres) and writes are swallowed,
 * never a 503 (spec N-9).
 */
export function createRedisUnreadCounter(
  getClient: () => Promise<RedisLike>
): UnreadCounter {
  const warn = (op: string, error: unknown) => {
    getMetrics().increment("dependency_unavailable_total", {
      dependency: "redis",
    });
    logger.warn("notifications.unread_counter.redis_failed", {
      metadata: { op, message: (error as Error).message },
    });
  };
  return {
    async get(userId) {
      try {
        const value = await (await getClient()).get(unreadCounterKey(userId));
        const n = value === null ? NaN : Number(value);
        return Number.isInteger(n) && n >= 0 ? n : null; // negative/garbage = drifted: recompute
      } catch (error) {
        warn("get", error);
        return null;
      }
    },
    async seed(userId, count) {
      try {
        // NX: never clobber a value the worker has already started incrementing. EX: bound any drift.
        await (
          await getClient()
        ).set(
          unreadCounterKey(userId),
          String(count),
          "EX",
          UNREAD_COUNTER_TTL_SECONDS,
          "NX"
        );
      } catch (error) {
        warn("seed", error);
      }
    },
    async decrement(userId, by) {
      try {
        const client = await getClient();
        const left = await client.decrby(unreadCounterKey(userId), by);
        // A missing key decrements to a negative: drop it so the next read recomputes from Postgres.
        if (left < 0) await client.del(unreadCounterKey(userId));
      } catch (error) {
        warn("decrement", error);
      }
    },
  };
}
