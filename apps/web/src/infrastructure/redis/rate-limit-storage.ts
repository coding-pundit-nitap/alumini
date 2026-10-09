import type { BetterAuthOptions } from "better-auth";

import { getRedis } from "@/infrastructure/redis/client";
import { getMetrics, logger } from "@/infrastructure/observability";

type RateLimitStorage = NonNullable<
  NonNullable<BetterAuthOptions["rateLimit"]>["customStorage"]
>;
type Rule = { window: number; max: number };

/**
 * Fixed window, atomic in one Lua script. A rejected request does not extend
 * the window.
 */
const CONSUME_SCRIPT = `
local count = tonumber(redis.call('GET', KEYS[1]) or '0')
if count >= tonumber(ARGV[1]) then
  local ttl = redis.call('TTL', KEYS[1])
  if ttl < 0 then
    redis.call('EXPIRE', KEYS[1], ARGV[2])
    ttl = tonumber(ARGV[2])
  end
  return {0, ttl}
end
count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[2])
end
return {1, 0}
`;

// Fallback while Redis is unreachable. Per-instance, so it allows half the configured limit.
const fallback = new Map<string, { count: number; resetAt: number }>();

function consumeInMemory(key: string, rule: Rule) {
  const now = Date.now();
  const max = Math.max(1, Math.floor(rule.max / 2));

  if (fallback.size > 10_000) {
    for (const [k, v] of fallback) if (v.resetAt <= now) fallback.delete(k);
  }

  const entry = fallback.get(key);
  if (!entry || entry.resetAt <= now) {
    fallback.set(key, { count: 1, resetAt: now + rule.window * 1000 });
    return { allowed: true, retryAfter: null };
  }
  if (entry.count >= max) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }
  entry.count += 1;
  return { allowed: true, retryAfter: null };
}

export const redisRateLimitStorage: RateLimitStorage = {
  async consume(key, rule) {
    try {
      const redis = await getRedis();
      const [allowed, retryAfter] = (await redis.eval(
        CONSUME_SCRIPT,
        1,
        `rl:auth:${key}`,
        rule.max,
        rule.window
      )) as [number, number];

      return allowed === 1
        ? { allowed: true, retryAfter: null }
        : { allowed: false, retryAfter: Math.max(1, retryAfter) };
    } catch (error) {
      getMetrics().increment("dependency_unavailable_total", {
        dependency: "redis",
      });
      logger.warn("ratelimit.redis.unavailable_fallback", {
        error,
        metadata: { fallback: "in-memory" },
      });
      return consumeInMemory(key, rule);
    }
  },
};
