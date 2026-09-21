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
