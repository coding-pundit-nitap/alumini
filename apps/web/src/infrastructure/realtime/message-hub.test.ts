import { EventEmitter } from "node:events";

import { beforeEach, describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => {
  const instances: unknown[] = [];
  return { instances };
});
vi.mock("ioredis", () => ({
  default: class FakeRedis extends EventEmitter {
    subscribe = vi.fn(async () => 1);
    unsubscribe = vi.fn(async () => 1);
    constructor() {
      super();
      redis.instances.push(this);
    }
  },
}));
vi.mock("@/config/env", () => ({ env: { REDIS_URL: "redis://x" } }));
vi.mock("@/infrastructure/observability", () => ({
  logger: { warn: vi.fn(), info: vi.fn() },
}));

import { subscribeToUser } from "./message-hub";

const fake = () =>
  redis.instances[0] as EventEmitter & {
    subscribe: ReturnType<typeof vi.fn>;
    unsubscribe: ReturnType<typeof vi.fn>;
  };
const hint = { conversationId: "c1", messageId: "m1" };

beforeEach(() => {
  (globalThis as { messageHub?: unknown }).messageHub = undefined;
  redis.instances.length = 0;
});

describe("message hub", () => {
  it("subscribes once per user and fans a hint out only to that user's listeners", () => {
    const a1 = vi.fn();
    const a2 = vi.fn();
    const b = vi.fn();
    subscribeToUser("alice", a1);
    subscribeToUser("alice", a2);
    subscribeToUser("bob", b);
    expect(fake().subscribe).toHaveBeenCalledTimes(2);

    fake().emit("message", "msg:user:alice", JSON.stringify(hint));
    expect(a1).toHaveBeenCalledWith(hint);
    expect(a2).toHaveBeenCalledWith(hint);
    expect(b).not.toHaveBeenCalled();
  });

  it("unsubscribes from Redis when the last listener leaves, and stops delivering", () => {
    const listener = vi.fn();
    const off = subscribeToUser("alice", listener);
    off();
    expect(fake().unsubscribe).toHaveBeenCalledWith("msg:user:alice");
    fake().emit("message", "msg:user:alice", JSON.stringify(hint));
    expect(listener).not.toHaveBeenCalled();
  });

  it("ignores a malformed payload instead of throwing into the Redis client", () => {
    const listener = vi.fn();
    subscribeToUser("alice", listener);
    expect(() =>
      fake().emit("message", "msg:user:alice", "{not json")
    ).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });
});
