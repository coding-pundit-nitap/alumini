import { describe, expect, it } from "vitest";

import { NO_TICK, pickTick, tickOptions } from "./role-tick";

describe("pickTick", () => {
  const verified = true;

  it("picks the highest held role automatically", () => {
    expect(
      pickTick({ verified, roles: ["ALUMNI", "MODERATOR"], preference: null })
    ).toEqual({ role: "MODERATOR", label: "Moderator", kind: "team" });
  });

  it("honours the chosen role while it is held, and falls back when it isn't", () => {
    expect(
      pickTick({
        verified,
        roles: ["ALUMNI", "MODERATOR"],
        preference: "ALUMNI",
      })?.kind
    ).toBe("alumni");
    expect(
      pickTick({ verified, roles: ["STUDENT"], preference: "ALUMNI" })?.role
    ).toBe("STUDENT");
  });

  it("shows nothing when hidden, unverified, or without a known role", () => {
    expect(
      pickTick({ verified, roles: ["ALUMNI"], preference: NO_TICK })
    ).toBeNull();
    expect(
      pickTick({ verified: false, roles: ["ALUMNI"], preference: null })
    ).toBeNull();
    expect(
      pickTick({ verified, roles: ["MYSTERY"], preference: null })
    ).toBeNull();
  });
});

describe("tickOptions", () => {
  it("lists held roles highest first", () => {
    expect(
      tickOptions(["STUDENT", "TP_ADMIN", "FACULTY"]).map((t) => t.role)
    ).toEqual(["TP_ADMIN", "FACULTY", "STUDENT"]);
  });
});
