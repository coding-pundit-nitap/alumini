import { describe, expect, it, vi } from "vitest";

import { silentLogger } from "../../tests/support.ts";
import { createMessageSentProcessor } from "./message-sent.ts";

const payload = {
  v: 1 as const,
  messageId: "11111111-1111-4111-8111-111111111111",
  conversationId: "22222222-2222-4222-8222-222222222222",
  senderId: "33333333-3333-4333-8333-333333333333",
};
const ctx = (logger = silentLogger()) => ({
  jobId: "j",
  attempt: 1,
  requestId: null,
  signal: new AbortController().signal,
  logger,
});

const noNotify = {
  deliver: async () => {},
  findEmail: async () => null,
  blocked: async () => false,
  debounce: null,
};

describe("message.sent processor", () => {
  it("publishes an ids-only hint to every participant, sender included (their other tabs)", async () => {
    const publish = vi.fn(async () => undefined);
    const processor = createMessageSentProcessor({
      participants: async () => ["a", "b", "c"],
      publisher: { publish },
      ...noNotify,
    });
    await processor(payload, ctx());
    expect(publish).toHaveBeenCalledTimes(3);
    expect(publish).toHaveBeenCalledWith("b", {
      conversationId: payload.conversationId,
      messageId: payload.messageId,
    });
  });

  it("lets a publish failure fail the job so the queue retries it", async () => {
    const processor = createMessageSentProcessor({
      participants: async () => ["a"],
      publisher: {
        publish: async () => Promise.reject(new Error("redis down")),
      },
      ...noNotify,
    });
    await expect(processor(payload, ctx())).rejects.toThrow("redis down");
  });

  it("succeeds with a warning when real-time is not configured: clients backfill by refetching", async () => {
    const logger = silentLogger();
    const warn = vi.spyOn(logger, "warn");
    await createMessageSentProcessor({
      participants: async () => ["a"],
      publisher: null,
      ...noNotify,
    })(payload, ctx(logger));
    expect(warn).toHaveBeenCalledWith(
      "message.sent.realtime_disabled",
      expect.anything()
    );
  });

  const notifyDeps = (over: Record<string, unknown> = {}) => {
    const deliver = vi.fn(async (input: unknown) => void input);
    let owner: string | null = null;
    const debounce = {
      tryStart: vi.fn(async (_r: string, _c: string, by: string) => {
        owner ??= by;
        return owner === by;
      }),
    };
    return {
      deliver,
      debounce,
      deps: {
        participants: async () => ["sender", "r1"],
        publisher: null,
        deliver,
        findEmail: async () => "e@nitap.ac.in",
        blocked: async () => false,
        debounce,
        ...over,
      },
    };
  };
  const sender = { ...payload, senderId: "sender" };

  it("writes an in-app row per message but emails once per debounce window (redelivery re-invokes deliver, which dedupes)", async () => {
    const { deliver, deps } = notifyDeps();
    const p = createMessageSentProcessor(deps);
    await p(sender, { ...ctx(), jobId: "e1" });
    await p({ ...sender, messageId: "m2" }, { ...ctx(), jobId: "e2" });
    await p(sender, { ...ctx(), jobId: "e1" }); // redelivery reaches deliver again (real deliver dedupes on the in-app insert: no second email)
    const calls = deliver.mock.calls.map((c) => c[0] as { emailTo?: string });
    expect(calls).toHaveLength(3);
    expect(calls.map((c) => !!c.emailTo)).toEqual([true, false, true]);
    expect(calls[0]).toMatchObject({
      eventId: "e1",
      type: "message.sent",
      category: "ENGAGEMENT",
      recipientId: "r1",
      payload: {
        conversationId: payload.conversationId,
        messageId: payload.messageId,
      },
    });
  });

  it("skips the sender and blocked pairs", async () => {
    const { deliver, deps } = notifyDeps({
      participants: async () => ["sender", "r1", "r2"],
      blocked: async (_a: string, b: string) => b === "r2",
    });
    await createMessageSentProcessor(deps)(sender, ctx());
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it("still delivers in-app without email when Redis debounce is unavailable or throws", async () => {
    const a = notifyDeps({ debounce: null });
    await createMessageSentProcessor(a.deps)(sender, ctx());
    const b = notifyDeps({
      debounce: { tryStart: async () => Promise.reject(new Error("down")) },
    });
    await createMessageSentProcessor(b.deps)(sender, ctx());
    for (const d of [a.deliver, b.deliver]) {
      expect(d).toHaveBeenCalledTimes(1);
      expect(
        (d.mock.calls[0]![0] as { emailTo?: string }).emailTo
      ).toBeUndefined();
    }
  });
});
