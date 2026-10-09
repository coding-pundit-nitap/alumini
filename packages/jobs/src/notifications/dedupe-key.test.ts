import { describe, expect, it } from "vitest";
import { dedupeKeyFor, messageDedupeKeyFor } from "./dedupe-key.ts";

describe("dedupeKeyFor", () => {
  it("is deterministic for the same event, recipient and type", () => {
    const input = {
      eventId: "e1",
      recipientId: "r1",
      type: "connection.requested",
    };
    expect(dedupeKeyFor(input)).toBe(dedupeKeyFor(input));
  });

  it("differs for different recipients of the same event (fan-out)", () => {
    expect(
      dedupeKeyFor({
        eventId: "e1",
        recipientId: "r1",
        type: "event.cancelled",
      })
    ).not.toBe(
      dedupeKeyFor({
        eventId: "e1",
        recipientId: "r2",
        type: "event.cancelled",
      })
    );
  });

  it("keys a debounced message notification by (recipient, conversation, window), not by event", () => {
    const w1 = { recipientId: "r1", conversationId: "c1", windowBucket: "w1" };
    expect(messageDedupeKeyFor(w1)).toBe(messageDedupeKeyFor({ ...w1 }));
    expect(messageDedupeKeyFor(w1)).not.toBe(
      messageDedupeKeyFor({ ...w1, windowBucket: "w2" })
    );
    expect(messageDedupeKeyFor(w1)).not.toBe(
      messageDedupeKeyFor({ ...w1, recipientId: "r2" })
    );
  });
});
