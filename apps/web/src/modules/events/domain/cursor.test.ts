import { describe, expect, it } from "vitest";

import { decodeCursor, encodeCursor } from "./cursor";

describe("cursor", () => {
  it("round-trips", () => {
    expect(
      decodeCursor(encodeCursor({ key: "2026-07-01T10:00:00.000Z", id: "e1" }))
    ).toEqual({
      key: "2026-07-01T10:00:00.000Z",
      id: "e1",
    });
  });

  it.each(["", "!!!", btoa("{}"), btoa('{"k":1,"i":"x"}')])(
    "rejects %j as INVALID_CURSOR",
    (raw) => {
      expect(() => decodeCursor(raw)).toThrow(
        expect.objectContaining({ code: "INVALID_CURSOR" })
      );
    }
  );
});
