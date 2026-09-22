import { describe, expect, it } from "vitest";

import { decodeCursor, encodeCursor } from "./cursor";

describe("cursor", () => {
  it("round-trips", () => {
    expect(decodeCursor(encodeCursor({ key: "asha rao", id: "u1" }))).toEqual({
      key: "asha rao",
      id: "u1",
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
