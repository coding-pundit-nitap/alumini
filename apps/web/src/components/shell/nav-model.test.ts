import { describe, expect, it } from "vitest";
import { PERMISSIONS as P } from "@nitap/database/permissions";
import { buildNav } from "./nav-model";

const BASE = [
  P.PROFILE_READ,
  P.PROFILE_UPDATE,
  P.DIRECTORY_SEARCH,
  P.SEARCH_GLOBAL,
  P.CONNECTION_MANAGE,
  P.MESSAGE_SEND,
  P.MENTOR_SEARCH,
  P.JOB_READ,
  P.EVENT_READ,
  P.EVENT_REGISTER,
  P.CHAPTER_JOIN,
  P.POST_CREATE,
  P.POST_INTERACT,
  P.REPORT_CREATE,
  P.DONATION_MAKE,
  P.NOTIFICATION_READ,
];
const nav = (
  perms: string[],
  opts: { state?: string; isMentor?: boolean } = {}
) =>
  buildNav({
    accountState: (opts.state ?? "VERIFIED") as never,
    isMentor: opts.isMentor ?? false,
    can: (p) => perms.includes(p),
  });
const labels = (m: ReturnType<typeof buildNav>) =>
  m.groups.flatMap((g) => g.entries.map((e) => e.label));

describe("buildNav", () => {
  it("student: find a mentor, no job posting, no admin", () => {
    const m = nav([...BASE, P.MENTORSHIP_REQUEST]);
    expect(labels(m)).toEqual(
      expect.arrayContaining([
        "Home",
        "Messages",
        "Notifications",
        "Directory",
        "Connections",
        "Find a mentor",
        "Jobs",
        "Events",
      ])
    );
    expect(labels(m)).not.toContain("My job posts");
    expect(labels(m)).not.toContain("Admin");
    expect(m.create.map((c) => c.label)).toEqual(["Post"]);
  });
  it("alumni mentor: Mentoring, job posts, achievements, create job", () => {
    const m = nav(
      [
        ...BASE,
        P.MENTOR_OPT_IN,
        P.MENTORSHIP_RESPOND,
        P.ACHIEVEMENT_SUBMIT,
        P.JOB_CREATE,
      ],
      { isMentor: true }
    );
    expect(labels(m)).toEqual(
      expect.arrayContaining(["Mentoring", "My job posts", "Achievements"])
    );
    expect(m.create.map((c) => c.label)).toEqual(["Post", "Job"]);
  });
  it("alumni not yet a mentor sees Mentorship", () => {
    expect(labels(nav([...BASE, P.MENTOR_OPT_IN]))).toContain("Mentorship");
  });
  it("coordinator: event create and a Manage group with Admin first", () => {
    const m = nav([
      ...BASE,
      P.EVENT_CREATE,
      P.ALUMNI_VERIFY,
      P.USER_READ_ADMIN,
    ]);
    const manage = m.groups.find((g) => g.label === "Manage");
    expect(manage?.entries[0]).toMatchObject({
      label: "Admin",
      href: "/admin",
    });
    expect(manage?.entries.length).toBeLessThanOrEqual(4);
    expect(m.create.map((c) => c.label)).toContain("Event");
  });
  it.each(["PENDING", "REJECTED"])("%s: only Verification", (state) => {
    const m = nav(BASE, { state });
    expect(labels(m)).toEqual(["Verification"]);
    expect(m.create).toEqual([]);
    expect(m.tabs.map((t) => t.label)).toEqual(["Verification"]);
  });
  it.each(["SUSPENDED", "DEACTIVATED"])("%s: only Account status", (state) => {
    expect(labels(nav(BASE, { state }))).toEqual(["Account status"]);
  });
  it("tabs are Home, Directory, Messages, Jobs for a member", () => {
    expect(nav(BASE).tabs.map((t) => t.href)).toEqual([
      "/dashboard",
      "/directory",
      "/messages",
      "/jobs",
    ]);
  });
  it("drops a tab the member cannot use", () => {
    const m = nav(BASE.filter((p) => p !== P.JOB_READ));
    expect(m.tabs.map((t) => t.href)).not.toContain("/jobs");
  });
});
