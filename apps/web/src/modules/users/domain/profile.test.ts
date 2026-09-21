import { describe, expect, it } from "vitest";

import { projectProfile, type ProfileRecord } from "./profile";
import type { Viewer, VisibilitySettings } from "./visibility";

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

const profile = (over: Partial<ProfileRecord> = {}): ProfileRecord => ({
  userId: "u1",
  fullName: "Asha Rao",
  headline: "Engineer",
  bio: "About me",
  location: "Tirupati",
  department: "Computer Science",
  degree: "B.Tech",
  graduationYear: 2019,
  experience: [
    {
      id: "e1",
      company: "Acme",
      industry: null,
      designation: "Engineer",
      startDate: "2020-01-01",
      endDate: null,
      isCurrent: true,
    },
  ],
  education: [
    {
      id: "d1",
      institution: "IIT Madras",
      qualification: "M.Tech",
      fieldOfStudy: null,
      startYear: 2019,
      endYear: 2021,
    },
  ],
  skills: [{ id: "s1", skill: "TypeScript" }],
  links: [{ id: "l1", type: "GITHUB", url: "https://github.com/asha" }],
  settings: settings(),
  ...over,
});

describe("projectProfile", () => {
  it("gives a member the full view of a MEMBERS_ONLY profile", () => {
    expect(projectProfile(profile(), "member")).toEqual({
      userId: "u1",
      fullName: "Asha Rao",
      headline: "Engineer",
      location: "Tirupati",
      bio: "About me",
      institution: {
        department: "Computer Science",
        degree: "B.Tech",
        graduationYear: 2019,
      },
      experience: [
        {
          company: "Acme",
          industry: null,
          designation: "Engineer",
          startDate: "2020-01-01",
          endDate: null,
          isCurrent: true,
        },
      ],
      education: [
        {
          institution: "IIT Madras",
          qualification: "M.Tech",
          fieldOfStudy: null,
          startYear: 2019,
          endYear: 2021,
        },
      ],
      skills: [{ skill: "TypeScript" }],
      links: [{ type: "GITHUB", url: "https://github.com/asha" }],
    });
  });

  it.each(["guest", "unverified"] as Viewer[])(
    "gives a %s only the reduced set of a PUBLIC profile, with the keys omitted",
    (viewer) => {
      const view = projectProfile(
        profile({ settings: settings({ visibility: "PUBLIC" }) }),
        viewer
      );
      expect(view).toEqual({
        userId: "u1",
        fullName: "Asha Rao",
        headline: "Engineer",
        location: "Tirupati",
      });
      expect("bio" in view!).toBe(false);
      expect("institution" in view!).toBe(false);
    }
  );

  it.each(["guest", "unverified", "member", "blocked"] as Viewer[])(
    "is null (not found) for a %s viewing a PRIVATE profile",
    (viewer) => {
      expect(
        projectProfile(
          profile({ settings: settings({ visibility: "PRIVATE" }) }),
          viewer
        )
      ).toBeNull();
    }
  );

  it("is null for a blocked viewer whatever the level", () => {
    expect(
      projectProfile(
        profile({ settings: settings({ visibility: "PUBLIC" }) }),
        "blocked"
      )
    ).toBeNull();
  });

  it("lets the owner and a privileged viewer see a PRIVATE profile in full", () => {
    const p = profile({ settings: settings({ visibility: "PRIVATE" }) });
    expect(projectProfile(p, "owner")?.bio).toBe("About me");
    expect(projectProfile(p, "privileged")?.institution?.graduationYear).toBe(
      2019
    );
  });

  it("omits the location key when its section override hides it, keeping the core visible", () => {
    const view = projectProfile(
      profile({ settings: settings({ location: "PRIVATE" }) }),
      "member"
    );
    expect(view?.fullName).toBe("Asha Rao");
    expect("location" in view!).toBe(false);
  });

  it("hides a connections-only profile from a plain member but not a connected one", () => {
    const p = profile({
      settings: settings({ visibility: "CONNECTIONS_ONLY" }),
    });
    expect(projectProfile(p, "member")).toBeNull();
    expect(projectProfile(p, "connected")).not.toBeNull();
  });
});

describe("projectProfile: the detail sections", () => {
  const keys = (view: object | null) => Object.keys(view ?? {});

  it("never exposes item ids to a viewer", () => {
    const view = projectProfile(profile(), "member")!;
    expect(JSON.stringify(view)).not.toMatch(/"id"/);
  });

  it("gives guests and unverified accounts none of the sections, even on a PUBLIC profile", () => {
    const p = profile({ settings: settings({ visibility: "PUBLIC" }) });
    for (const viewer of ["guest", "unverified"] as Viewer[]) {
      const k = keys(projectProfile(p, viewer));
      for (const section of ["experience", "education", "skills", "links"]) {
        expect(k).not.toContain(section);
      }
    }
  });

  it("experience and skills share experience_visibility", () => {
    const k = keys(
      projectProfile(
        profile({ settings: settings({ experience: "PRIVATE" }) }),
        "member"
      )
    );
    expect(k).not.toContain("experience");
    expect(k).not.toContain("skills");
    expect(k).toContain("education");
    expect(k).toContain("links");
  });

  it("education follows education_visibility alone", () => {
    const k = keys(
      projectProfile(
        profile({ settings: settings({ education: "PRIVATE" }) }),
        "member"
      )
    );
    expect(k).not.toContain("education");
    expect(k).toEqual(
      expect.arrayContaining(["experience", "skills", "links"])
    );
  });

  it("links follow contact_visibility alone", () => {
    const k = keys(
      projectProfile(
        profile({ settings: settings({ contact: "PRIVATE" }) }),
        "member"
      )
    );
    expect(k).not.toContain("links");
    expect(k).toEqual(
      expect.arrayContaining(["experience", "education", "skills"])
    );
  });

  it("shows an empty visible section as an empty list, not as an omitted key", () => {
    const view = projectProfile(profile({ skills: [] }), "member")!;
    expect(view.skills).toEqual([]);
  });

  it("lets the owner and a privileged viewer see every section regardless of overrides", () => {
    const p = profile({
      settings: settings({
        visibility: "PRIVATE",
        experience: "PRIVATE",
        education: "PRIVATE",
        contact: "PRIVATE",
      }),
    });
    for (const viewer of ["owner", "privileged"] as Viewer[]) {
      expect(keys(projectProfile(p, viewer))).toEqual(
        expect.arrayContaining(["experience", "education", "skills", "links"])
      );
    }
  });
});
