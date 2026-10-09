import { describe, expect, it, vi } from "vitest";

vi.mock("@/infrastructure/redis/client", () => ({
  getRedis: async () => {
    throw new Error("redis down");
  },
}));
const increment = vi.hoisted(() => vi.fn());
vi.mock("@/infrastructure/observability", () => ({
  logger: { warn: () => undefined },
  getMetrics: () => ({ increment }),
}));

import { redisRateLimitStorage } from "./rate-limit-storage";

const key = () => `test-${Math.random().toString(36).slice(2)}`;

describe("rate limiting while Redis is unreachable", () => {
  it("falls back to a stricter per-instance limit: half the allowance", async () => {
    const rule = { window: 60, max: 10 };
    const k = key();
    const results: boolean[] = [];
    for (let i = 0; i < 6; i += 1) {
      results.push((await redisRateLimitStorage.consume(k, rule)).allowed);
    }
    expect(results).toEqual([true, true, true, true, true, false]);
  });

  it("never drops below one attempt", async () => {
    const rule = { window: 60, max: 1 };
    const k = key();
    expect((await redisRateLimitStorage.consume(k, rule)).allowed).toBe(true);
    expect((await redisRateLimitStorage.consume(k, rule)).allowed).toBe(false);
  });

  it("counts each fallback on dependency_unavailable_total", async () => {
    increment.mockClear();
    await redisRateLimitStorage.consume(key(), { window: 60, max: 4 });
    expect(increment).toHaveBeenCalledWith("dependency_unavailable_total", {
      dependency: "redis",
    });
  });
});
