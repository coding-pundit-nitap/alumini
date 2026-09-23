import { describe, expect, it, vi } from "vitest";

import { createRedisUnreadCounter } from "./unread-counter.ts";

describe("worker unread counter", () => {
  it("increments only an existing key (Lua), leaving seed and TTL to the web", async () => {
    const redis = { eval: vi.fn(async () => 5) };
    await createRedisUnreadCounter(redis as never).increment("u1");
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("EXISTS"),
      1,
      "notif:unread:u1"
    );
  });
});
