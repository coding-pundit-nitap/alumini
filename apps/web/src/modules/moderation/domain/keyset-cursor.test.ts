import { describe, expect, it } from "vitest";

import { decodeKeysetCursor, encodeKeysetCursor } from "./keyset-cursor";

describe("moderation keyset cursor", () => {
  it("round-trips", () => {
    const c = {
      createdAt: new Date("2026-09-24T10:00:00.123Z"),
      id: "00000000-0000-4000-8000-000000000001",
    };
    expect(decodeKeysetCursor(encodeKeysetCursor(c))).toEqual(c);
  });
  it("returns null for anything it did not issue", () => {
    expect(decodeKeysetCursor("garbage")).toBeNull();
    expect(
      decodeKeysetCursor(btoa(JSON.stringify({ c: "x", i: "y" })))
    ).toBeNull();
  });
});
