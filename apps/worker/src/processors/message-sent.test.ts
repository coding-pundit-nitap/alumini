import { describe, expect, it, vi } from "vitest";

import { messageDedupeKeyFor } from "@nitap/jobs";

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

  it("a hint publish failure is logged and never stops the notification fan-out", async () => {
    const logger = silentLogger();
    const warn = vi.spyOn(logger, "warn");
    const deliver = vi.fn(async () => {});
    await createMessageSentProcessor({
      participants: async () => ["sender", "r1"],
      publisher: {
        publish: async () => Promise.reject(new Error("redis down")),
      },
      ...noNotify,
      deliver,
    })({ ...payload, senderId: "sender" }, ctx(logger));
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      "message.sent.hint_failed",
      expect.anything()
    );
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
      claim: vi.fn(async (_r: string, _c: string, by: string) => {
        owner ??= by;
        return { owner: owner === by, window: owner };
      }),
      /** What reading the conversation does in the web app. */
      read: () => {
        owner = null;
      },
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
  type Delivered = { emailTo?: string; dedupeKey?: string };

  it("keys every message in one window to one notification and emails once; reading starts a new window", async () => {
    const { deliver, debounce, deps } = notifyDeps();
    const p = createMessageSentProcessor(deps);
    await p(sender, { ...ctx(), jobId: "e1" });
    await p({ ...sender, messageId: "m2" }, { ...ctx(), jobId: "e2" });
    await p(sender, { ...ctx(), jobId: "e1" }); // redelivery of the window owner
    debounce.read();
    await p({ ...sender, messageId: "m3" }, { ...ctx(), jobId: "e3" });
    const calls = deliver.mock.calls.map((c) => c[0] as Delivered);
    expect(calls.map((c) => !!c.emailTo)).toEqual([true, false, true, true]);
    const window1 = messageDedupeKeyFor({
      recipientId: "r1",
      conversationId: payload.conversationId,
      windowBucket: "e1",
    });
    expect(calls.map((c) => c.dedupeKey)).toEqual([
      window1,
      window1,
      window1,
      messageDedupeKeyFor({
        recipientId: "r1",
        conversationId: payload.conversationId,
        windowBucket: "e3",
      }),
    ]);
    expect(calls[0]).toMatchObject({
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
      debounce: { claim: async () => Promise.reject(new Error("down")) },
    });
    await createMessageSentProcessor(b.deps)(sender, ctx());
    for (const d of [a.deliver, b.deliver]) {
      expect(d).toHaveBeenCalledTimes(1);
      const input = d.mock.calls[0]![0] as Delivered;
      expect(input.emailTo).toBeUndefined();
      // Still one row per (recipient, conversation, time bucket), never one per message.
      expect(input.dedupeKey).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
