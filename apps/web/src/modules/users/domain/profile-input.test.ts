import { describe, expect, it } from "vitest";

import {
  sanitiseMultiLine,
  sanitiseSingleLine,
  updatePrivacySchema,
  updateProfileSchema,
} from "./profile-input";

describe("sanitiseSingleLine", () => {
  it("trims, collapses whitespace and strips control and zero-width characters", () => {
    expect(sanitiseSingleLine("  Asha \t\n  Rao​ ")).toBe("Asha Rao");
    expect(sanitiseSingleLine("A\u0000b﻿c")).toBe("Abc");
  });
});

describe("sanitiseMultiLine", () => {
  it("keeps single and double newlines, collapses longer runs, strips control characters", () => {
    expect(sanitiseMultiLine("a\r\nb\n\n\n\nc​\u0007")).toBe("a\nb\n\nc");
  });
  it("collapses horizontal whitespace and trims", () => {
    expect(sanitiseMultiLine("  one \t two  \n three  ")).toBe(
      "one two\nthree"
    );
  });
});

describe("updateProfileSchema", () => {
  const valid = {
    fullName: "Asha Rao",
    headline: "Engineer",
    bio: "Hi",
    location: "Tirupati",
  };

  it("parses and sanitises the four core fields", () => {
    expect(
      updateProfileSchema.parse({ ...valid, fullName: "  Asha   Rao " })
    ).toEqual(valid);
  });

  it("turns empty optional fields into null", () => {
    expect(
      updateProfileSchema.parse({
        fullName: "Asha",
        headline: " ",
        bio: "",
        location: undefined,
      })
    ).toEqual({ fullName: "Asha", headline: null, bio: null, location: null });
  });

  it("requires a name and enforces the length limits", () => {
    const fields = (input: unknown) => {
      const r = updateProfileSchema.safeParse(input);
      return r.success ? [] : r.error.issues.map((i) => i.path[0]);
    };
    expect(fields({ ...valid, fullName: "   " })).toEqual(["fullName"]);
    expect(fields({ ...valid, fullName: "x".repeat(101) })).toEqual([
      "fullName",
    ]);
    expect(fields({ ...valid, headline: "x".repeat(121) })).toEqual([
      "headline",
    ]);
    expect(fields({ ...valid, bio: "x".repeat(2001) })).toEqual(["bio"]);
    expect(fields({ ...valid, location: "x".repeat(101) })).toEqual([
      "location",
    ]);
  });

  // Self-service can never express an institutional change.
  it.each([
    "departmentId",
    "degreeId",
    "graduationYear",
    "userId",
    "visibility",
  ])("rejects the unknown key %s instead of silently stripping it", (key) => {
    expect(
      updateProfileSchema.safeParse({ ...valid, [key]: "x" }).success
    ).toBe(false);
  });
});

describe("updatePrivacySchema", () => {
  it("maps INHERIT and a missing override to null", () => {
    expect(
      updatePrivacySchema.parse({
        visibility: "MEMBERS_ONLY",
        location: "INHERIT",
      })
    ).toEqual({
      visibility: "MEMBERS_ONLY",
      contact: null,
      location: null,
      experience: null,
      education: null,
    });
  });

  it("accepts an override equal to or stricter than the level", () => {
    expect(
      updatePrivacySchema.parse({
        visibility: "MEMBERS_ONLY",
        location: "PRIVATE",
      }).location
    ).toBe("PRIVATE");
  });

  it("rejects an override looser than the level, naming the section", () => {
    const r = updatePrivacySchema.safeParse({
      visibility: "PRIVATE",
      location: "PUBLIC",
    });
    expect(r.success).toBe(false);
    expect(!r.success && r.error.issues[0]?.path).toEqual(["location"]);
  });

  it("rejects an unknown level and unknown keys", () => {
    expect(
      updatePrivacySchema.safeParse({ visibility: "EVERYONE" }).success
    ).toBe(false);
    expect(
      updatePrivacySchema.safeParse({
        visibility: "PUBLIC",
        departmentId: "x",
      }).success
    ).toBe(false);
  });
});
