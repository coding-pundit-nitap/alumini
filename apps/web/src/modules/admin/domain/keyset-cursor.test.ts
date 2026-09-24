import { describe, expect, it } from "vitest";

import { decodeKeysetCursor, encodeKeysetCursor } from "./keyset-cursor";

describe("keyset cursor", () => {
  it("round-trips", () => {
    const c = {
      createdAt: new Date("2026-09-24T10:00:00.000Z"),
      id: "00000000-0000-4000-8000-000000000001",
    };
    expect(decodeKeysetCursor(encodeKeysetCursor(c))).toEqual(c);
  });
  it.each(["", "not-base64!", btoa('{"c":"x","i":"y"}')])(
    "rejects %j",
    (raw) => {
      expect(decodeKeysetCursor(raw)).toBeNull();
    }
  );
});
