import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor } from "./cursor";

describe("notification cursor", () => {
  it("round-trips createdAt and id", () => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const cursor = encodeCursor(createdAt, "abc-123");
    expect(decodeCursor(cursor)).toEqual({ createdAt, id: "abc-123" });
  });

  it("rejects a malformed cursor", () => {
    expect(() => decodeCursor("not-a-cursor")).toThrow();
  });
});
