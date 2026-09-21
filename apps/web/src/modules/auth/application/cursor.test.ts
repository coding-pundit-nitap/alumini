import { describe, expect, it } from "vitest";

import { decodeCursor, encodeCursor } from "./cursor";

describe("page cursors", () => {
  it("round-trips", () => {
    const cursor = {
      createdAt: new Date("2026-09-21T10:00:00.123Z"),
      id: "abc",
    };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it("is URL-safe", () => {
    expect(encodeCursor({ createdAt: new Date(0), id: "a/b+c" })).toMatch(
      /^[A-Za-z0-9_-]+$/
    );
  });

  it.each(["", "not base64 !!", "e30", "eyJjIjoibm9wZSIsImkiOjF9"])(
    "rejects %j as INVALID_CURSOR",
    (raw) => {
      expect(() => decodeCursor(raw)).toThrowError(
        expect.objectContaining({ code: "INVALID_CURSOR", status: 400 })
      );
    }
  );
});
