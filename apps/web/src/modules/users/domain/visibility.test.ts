import { describe, expect, it } from "vitest";

import {
  canView,
  effectiveLevel,
  overridesNotLooser,
  VISIBILITY_LEVELS,
  type Viewer,
  type Visibility,
  type VisibilitySettings,
} from "./visibility";

const ALL = {
  PUBLIC: true,
  MEMBERS_ONLY: true,
  CONNECTIONS_ONLY: true,
  PRIVATE: true,
};
const NONE = {
  PUBLIC: false,
  MEMBERS_ONLY: false,
  CONNECTIONS_ONLY: false,
  PRIVATE: false,
};

/**
 * The visibility matrix: viewer type x level. This table is the documented
 * contract.
 */
const EXPECTED: Record<Viewer, Record<Visibility, boolean>> = {
  owner: ALL,
  privileged: ALL,
  blocked: NONE,
  guest: { ...NONE, PUBLIC: true },
  unverified: { ...NONE, PUBLIC: true },
  member: { ...NONE, PUBLIC: true, MEMBERS_ONLY: true },
  connected: { ...ALL, PRIVATE: false },
};

describe("canView", () => {
  for (const viewer of Object.keys(EXPECTED) as Viewer[]) {
    for (const level of VISIBILITY_LEVELS) {
      it(`${viewer} viewing ${level} → ${EXPECTED[viewer][level]}`, () => {
        expect(canView(level, viewer)).toBe(EXPECTED[viewer][level]);
      });
    }
  }
});

const settings = (
  over: Partial<VisibilitySettings> = {}
): VisibilitySettings => ({
  visibility: "MEMBERS_ONLY",
  contact: null,
  location: null,
  experience: null,
  education: null,
  ...over,
});

describe("effectiveLevel", () => {
  it("core always follows the profile level", () => {
    expect(effectiveLevel(settings({ visibility: "PUBLIC" }), "core")).toBe(
      "PUBLIC"
    );
  });
  it("a null override inherits the profile level", () => {
    expect(effectiveLevel(settings(), "location")).toBe("MEMBERS_ONLY");
  });
  it("an override replaces the profile level for its section only", () => {
    const s = settings({ location: "PRIVATE" });
    expect(effectiveLevel(s, "location")).toBe("PRIVATE");
    expect(effectiveLevel(s, "contact")).toBe("MEMBERS_ONLY");
  });
});

describe("overridesNotLooser", () => {
  it("returns nothing when every override is equal, stricter or null", () => {
    expect(
      overridesNotLooser(
        settings({ location: "MEMBERS_ONLY", contact: "PRIVATE" })
      )
    ).toEqual([]);
  });
  it("names each section looser than the profile level", () => {
    expect(
      overridesNotLooser(
        settings({
          visibility: "PRIVATE",
          location: "PUBLIC",
          education: "MEMBERS_ONLY",
        })
      )
    ).toEqual(["location", "education"]);
  });
});
