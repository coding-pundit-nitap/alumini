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

describe("message.sent processor", () => {
  it("publishes an ids-only hint to every participant, sender included (their other tabs)", async () => {
    const publish = vi.fn(async () => undefined);
    const processor = createMessageSentProcessor({
      participants: async () => ["a", "b", "c"],
      publisher: { publish },
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
    });
    await expect(processor(payload, ctx())).rejects.toThrow("redis down");
  });

  it("succeeds with a warning when real-time is not configured: clients backfill by refetching", async () => {
    const logger = silentLogger();
    const warn = vi.spyOn(logger, "warn");
    await createMessageSentProcessor({
      participants: async () => ["a"],
      publisher: null,
    })(payload, ctx(logger));
    expect(warn).toHaveBeenCalledWith(
      "message.sent.realtime_disabled",
      expect.anything()
    );
  });
});
