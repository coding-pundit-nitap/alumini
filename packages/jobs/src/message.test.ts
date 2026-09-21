import { describe, expect, it } from "vitest";

import { messageSent } from "./message.ts";
import { OUTBOX_EVENTS, isOutboxEventType } from "./registry.ts";

const payload = {
  v: 1 as const,
  messageId: "11111111-1111-4111-8111-111111111111",
  conversationId: "22222222-2222-4222-8222-222222222222",
  senderId: "33333333-3333-4333-8333-333333333333",
};

describe("message.sent", () => {
  it("accepts an ids-only payload", () => {
    expect(messageSent.schema.safeParse(payload).success).toBe(true);
  });

  it("rejects a payload that carries the message body", () => {
    expect(
      messageSent.schema.safeParse({ ...payload, body: "hello" }).success
    ).toBe(false);
  });

  it("is an outbox event", () => {
    expect(isOutboxEventType("message.sent")).toBe(true);
    expect(OUTBOX_EVENTS["message.sent"]).toBe(messageSent);
  });
});
