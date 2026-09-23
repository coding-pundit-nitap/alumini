import { Redis } from "ioredis";
import { afterAll, describe, expect, it } from "vitest";

import { createRedisUnreadCounter } from "../src/notifications/unread-counter.ts";

const redis = new Redis(process.env.REDIS_URL!);
afterAll(() => redis.quit());

describe("worker unread counter on real Redis", () => {
  it("does not create a missing key; increments an existing one and keeps its TTL", async () => {
    const id = `t-${crypto.randomUUID()}`;
    const key = `notif:unread:${id}`;
    const counter = createRedisUnreadCounter(redis);
    await counter.increment(id);
    expect(await redis.exists(key)).toBe(0);
    await redis.set(key, "3", "EX", 100);
    await counter.increment(id);
    expect(await redis.get(key)).toBe("4");
    expect(await redis.ttl(key)).toBeGreaterThan(90);
    await redis.del(key);
  });
});
