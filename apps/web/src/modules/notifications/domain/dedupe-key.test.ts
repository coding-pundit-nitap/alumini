import { describe, expect, it } from "vitest";
import { dedupeKeyFor } from "./dedupe-key";

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
});
