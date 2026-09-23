import { describe, expect, it, vi } from "vitest";

import { createMarkRead } from "./mark-read";

const U = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const setup = (onRead?: (u: string, c: string) => Promise<void>) => {
  const tx = {
    lockConversation: async () => ({ id: C, isGroup: true }),
    participantIds: async () => [U],
    markRead: vi.fn(async () => {}),
  };
  const markRead = createMarkRead({
    store: {
      transaction: async (fn: (t: unknown) => unknown) => fn(tx),
    } as never,
    authorize: (() => ({ userId: U })) as never,
    onRead,
  });
  return {
    tx,
    run: () =>
      markRead({ actor: null, conversationId: C, input: { upToSeq: "5" } }),
  };
};

describe("markRead debounce flush (N-7)", () => {
  it("notifies onRead after the marker moves", async () => {
    const onRead = vi.fn(async () => {});
    const { tx, run } = setup(onRead);
    await run();
    expect(tx.markRead).toHaveBeenCalled();
    expect(onRead).toHaveBeenCalledWith(U, C);
  });

  it("never fails mark-read when onRead throws, or is absent", async () => {
    await expect(
      setup(async () => Promise.reject(new Error("redis"))).run()
    ).resolves.toBeUndefined();
    await expect(setup().run()).resolves.toBeUndefined();
  });
});
