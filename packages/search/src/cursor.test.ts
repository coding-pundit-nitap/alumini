import { describe, expect, it } from "vitest";

import { InvalidCursorError, decodeCursor, encodeCursor } from "./cursor.ts";

const id = "6f0c3b0e-3a1f-4e0b-9b52-0d4c2f7b9a11";

describe("cursor", () => {
  it("round-trips a position for its own sort", () => {
    const raw = encodeCursor("name", { value: "asha rao", id });
    expect(decodeCursor(raw, "name")).toEqual({ value: "asha rao", id });
  });

  it.each([
    ["not base64 json", "%%%"],
    ["a scalar", Buffer.from("42").toString("base64url")],
    [
      "a bad id",
      Buffer.from(JSON.stringify({ s: "name", v: "x", i: "nope" })).toString(
        "base64url"
      ),
    ],
    [
      "a value of the wrong shape",
      encodeCursor("graduationYear", { value: "abc", id }),
    ],
  ])("rejects %s", (_label, raw) => {
    expect(() => decodeCursor(raw, "graduationYear")).toThrow(
      InvalidCursorError
    );
  });

  it("rejects a cursor minted for another sort", () => {
    const raw = encodeCursor("name", { value: "asha", id });
    expect(() => decodeCursor(raw, "relevance")).toThrow(InvalidCursorError);
  });
});
