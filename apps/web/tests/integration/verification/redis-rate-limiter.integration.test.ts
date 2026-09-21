import { afterAll, describe, expect, it } from "vitest";

import { getRedis } from "@/infrastructure/redis/client";
import { redisRateLimitStorage } from "@/infrastructure/redis/rate-limit-storage";
import { createRedisRateLimiter } from "@/modules/auth/infrastructure/redis-rate-limiter";

const prefix = `verification.test.${Math.random().toString(36).slice(2)}`;

afterAll(async () => {
  const redis = await getRedis();
  const keys = await redis.keys(`rl:auth:verification:${prefix}*`);
  if (keys.length > 0) await redis.del(...keys);
});

describe("redis rate limiter (real Redis)", () => {
  const limiter = createRedisRateLimiter(redisRateLimitStorage);

  it("allows up to max attempts per window, then denies with a retry hint", async () => {
    const key = `${prefix}:a`;
    const rule = { windowSeconds: 60, max: 3 };

    const results = [];
    for (let i = 0; i < 4; i += 1)
      results.push(await limiter.consume(key, rule));

    expect(results.slice(0, 3).every((r) => r.allowed)).toBe(true);
    expect(results[3]?.allowed).toBe(false);
    expect(results[3]?.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("counts keys independently", async () => {
    const rule = { windowSeconds: 60, max: 1 };
    expect((await limiter.consume(`${prefix}:b`, rule)).allowed).toBe(true);
    expect((await limiter.consume(`${prefix}:c`, rule)).allowed).toBe(true);
    expect((await limiter.consume(`${prefix}:b`, rule)).allowed).toBe(false);
  });
});
