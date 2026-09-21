import type { RateLimiter } from "../application/rate-limiter";

type Storage = {
  consume(
    key: string,
    rule: { window: number; max: number }
  ): Promise<{ allowed: boolean; retryAfter: number | null }>;
};

/**
 * The same atomic Redis limiter Better Auth uses (with its stricter per-instance fallback while Redis is
 * unreachable), under its own key namespace so verification limits never collide with sign-in limits.
 */
export function createRedisRateLimiter(storage: Storage): RateLimiter {
  return {
    async consume(key, rule) {
      const result = await storage.consume(`verification:${key}`, {
        window: rule.windowSeconds,
        max: rule.max,
      });
      return { allowed: result.allowed, retryAfterSeconds: result.retryAfter };
    },
  };
}
