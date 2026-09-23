import { describe, expect, it, vi } from "vitest";

import { UNREAD_COUNTER_TTL_SECONDS } from "@nitap/jobs";

import { createRedisUnreadCounter } from "./unread-counter.ts";

function fake(decrbyResult = 0) {
  const calls: unknown[][] = [];
  const chain = {
    incr: (...a: unknown[]) => (calls.push(["incr", ...a]), chain),
    expire: (...a: unknown[]) => (calls.push(["expire", ...a]), chain),
    exec: async () => [],
  };
  const redis = {
    multi: () => chain,
    decrby: vi.fn(async () => decrbyResult),
    del: vi.fn(async () => 1),
    get: vi.fn(async () => null),
  };
  return { redis, calls };
}

describe("worker unread counter", () => {
  it("increments and gives a fresh key a TTL (EXPIRE NX) in one transaction", async () => {
    const { redis, calls } = fake();
    await createRedisUnreadCounter(redis as never).increment("u1");
    expect(calls).toEqual([
      ["incr", "notif:unread:u1"],
      ["expire", "notif:unread:u1", UNREAD_COUNTER_TTL_SECONDS, "NX"],
    ]);
  });

  it("drops a key a decrement drove negative", async () => {
    const { redis } = fake(-1);
    await createRedisUnreadCounter(redis as never).decrement("u1");
    expect(redis.del).toHaveBeenCalledWith("notif:unread:u1");
  });

  it("keeps a non-negative key", async () => {
    const { redis } = fake(2);
    await createRedisUnreadCounter(redis as never).decrement("u1", 2);
    expect(redis.del).not.toHaveBeenCalled();
  });
});
