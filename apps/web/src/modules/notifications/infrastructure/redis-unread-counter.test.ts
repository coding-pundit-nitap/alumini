import { describe, expect, it, vi } from "vitest";

import { UNREAD_COUNTER_TTL_SECONDS } from "@nitap/jobs";

import { createRedisUnreadCounter } from "./redis-unread-counter";

const client = () => ({
  get: vi.fn(),
  set: vi.fn(async () => "OK"),
  decrby: vi.fn(async () => 0),
  del: vi.fn(async () => 1),
});

describe("web unread counter", () => {
  it("seeds with a TTL and NX (never clobbers a live key)", async () => {
    const c = client();
    await createRedisUnreadCounter(async () => c).seed("u1", 4);
    expect(c.set).toHaveBeenCalledWith(
      "notif:unread:u1",
      "4",
      "EX",
      UNREAD_COUNTER_TTL_SECONDS,
      "NX"
    );
  });

  it("deletes a key that a decrement drove negative", async () => {
    const c = client();
    c.decrby.mockResolvedValue(-1);
    await createRedisUnreadCounter(async () => c).decrement("u1", 1);
    expect(c.del).toHaveBeenCalledWith("notif:unread:u1");
  });

  it("swallows Redis errors", async () => {
    const counter = createRedisUnreadCounter(async () => {
      throw new Error("down");
    });
    expect(await counter.get("u1")).toBeNull();
    await expect(counter.seed("u1", 1)).resolves.toBeUndefined();
    await expect(counter.decrement("u1", 1)).resolves.toBeUndefined();
  });
});
