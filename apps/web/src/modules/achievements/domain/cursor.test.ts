import { describe, expect, it } from "vitest";

import { decodeAchievementCursor, encodeAchievementCursor } from "./cursor";

describe("achievement cursor", () => {
  it("round-trips, url-safe and unpadded", () => {
    const cursor = {
      createdAt: new Date("2026-10-09T10:00:00.123Z"),
      id: "11111111-1111-4111-8111-111111111111",
    };
    const raw = encodeAchievementCursor(cursor);
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeAchievementCursor(raw)).toEqual(cursor);
  });

  it.each([
    ["not base64", "%%%"],
    ["not json", btoa("nope")],
    ["missing id", btoa(JSON.stringify({ t: "2026-01-01T00:00:00Z" }))],
    ["bad date", btoa(JSON.stringify({ t: "never", i: "x" }))],
    ["numeric time", btoa(JSON.stringify({ t: 1, i: "x" }))],
  ])("refuses %s as INVALID_CURSOR", (_label, raw) => {
    expect(() => decodeAchievementCursor(raw)).toThrow(
      expect.objectContaining({ code: "INVALID_CURSOR" })
    );
  });
});
