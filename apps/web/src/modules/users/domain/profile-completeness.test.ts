import { describe, expect, it } from "vitest";

import type { ProfileRecord } from "./profile";
import { profileCompleteness } from "./profile-completeness";

const empty = {
  userId: "u1",
  fullName: "Asha Rao",
  headline: null,
  bio: null,
  location: null,
  department: "CSE",
  degree: "B.Tech",
  graduationYear: 2019,
  photoUploadId: null,
  experience: [],
  education: [],
  skills: [],
  links: [],
  settings: {} as ProfileRecord["settings"],
} satisfies ProfileRecord;

const full: ProfileRecord = {
  ...empty,
  headline: "Backend engineer",
  bio: "Hi",
  location: "Bengaluru",
  photoUploadId: "p1",
  experience: [{}] as ProfileRecord["experience"],
  education: [{}] as ProfileRecord["education"],
  skills: [{}] as ProfileRecord["skills"],
  links: [{}] as ProfileRecord["links"],
};

describe("profileCompleteness (H-7)", () => {
  it("is 0 % with every item missing for an empty profile", () => {
    expect(profileCompleteness(empty)).toEqual({
      percent: 0,
      missing: [
        "Headline",
        "About",
        "Location",
        "Photo",
        "Experience",
        "Education",
        "Skills",
        "Links",
      ],
    });
  });

  it("is 100 % with nothing missing for a full profile", () => {
    expect(profileCompleteness(full)).toEqual({ percent: 100, missing: [] });
  });

  it("counts each check once and rounds", () => {
    expect(
      profileCompleteness({ ...empty, headline: "x", skills: full.skills })
        .percent
    ).toBe(25);
    expect(
      profileCompleteness({ ...empty, headline: "x", bio: "y", location: "z" })
        .percent
    ).toBe(38);
  });

  it("treats whitespace-only text as missing", () => {
    expect(
      profileCompleteness({ ...empty, headline: "   " }).missing
    ).toContain("Headline");
  });

  it("treats a missing profile as 0 %", () => {
    expect(profileCompleteness(null).percent).toBe(0);
  });
});
