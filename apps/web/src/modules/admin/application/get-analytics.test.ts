import { describe, expect, it, vi } from "vitest";
import { PERMISSIONS, type Permission } from "@nitap/database/permissions";

import { AuthenticationError, AuthorizationError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import type { AnalyticsStore } from "./admin-store";
import { createGetAnalytics } from "./get-analytics";

const actor: Actor = {
  userId: "u1",
  accountState: "VERIFIED",
  requestId: "r",
  grants: [],
};
const NOW = new Date("2026-10-01T06:00:00Z");

function setup(held: Permission[], overrides: Partial<AnalyticsStore> = {}) {
  const has = (p: Permission) => held.includes(p);
  const store: AnalyticsStore = {
    membersSection: vi.fn(async () => ({
      byState: { VERIFIED: 40 },
      signups: [{ week: "2026-09-28", value: 2 }],
      byRole: [
        { key: "R1", value: 30 },
        { key: "R2", value: 3 },
      ],
      byGraduationYear: [{ key: "2020", value: 0 }],
      verification: { approved: 2, rejected: 1, medianHoursToReview: 5 },
    })),
    jobsSection: vi.fn(async () => ({
      submitted: [],
      byStatus: [{ key: "PUBLISHED", value: 2 }],
      openByEmploymentType: [{ key: "FULL_TIME", value: 7 }],
    })),
    eventsSection: vi.fn(async () => ({
      held: 1,
      cancelled: 0,
      registrations: 3,
      averageFillRate: 0.5,
      upcoming: 2,
    })),
    communitySection: vi.fn(async () => ({
      posts: [],
      comments: [],
      reportsByStatus: [],
    })),
    ...overrides,
  };
  const authorize = vi.fn((a: Actor | null, p: Permission) => {
    if (!a) throw new AuthenticationError();
    if (!has(p)) throw new AuthorizationError();
    return a;
  });
  const onSectionFailed = vi.fn();
  const get = createGetAnalytics({
    store,
    authorize,
    can: (_a, p) => has(p),
    now: () => NOW,
    onSectionFailed,
  });
  return { get, store, authorize, onSectionFailed };
}

const V = PERMISSIONS.ANALYTICS_VIEW;

describe("getAnalytics", () => {
  it("401s without an actor", async () => {
    const { get } = setup([V]);
    await expect(get({ actor: null })).rejects.toBeInstanceOf(
      AuthenticationError
    );
  });

  it("403s without analytics.view and never reads", async () => {
    const { get, store } = setup([PERMISSIONS.JOB_APPROVE]);
    await expect(get({ actor })).rejects.toBeInstanceOf(AuthorizationError);
    expect(store.jobsSection).not.toHaveBeenCalled();
  });

  it("reads only the sections whose data permission is co-held", async () => {
    const { get, store } = setup([V, PERMISSIONS.JOB_APPROVE]);
    const { sections } = await get({ actor, range: "90d" });
    expect(sections.map((s) => s.key)).toEqual(["jobs"]);
    expect(store.membersSection).not.toHaveBeenCalled();
    expect(store.jobsSection).toHaveBeenCalledWith({
      from: new Date(NOW.getTime() - 90 * 86_400_000),
      to: NOW,
    });
  });

  it("defaults an unknown range to 30d", async () => {
    const { get } = setup([V]);
    expect((await get({ actor, range: "7d" })).range).toBe("30d");
  });

  it("masks small breakdown buckets and fills weekly series", async () => {
    const { get } = setup([V, PERMISSIONS.ALUMNI_VERIFY]);
    const [members] = (await get({ actor })).sections;
    expect(members).toMatchObject({ key: "members", status: "ok" });
    if (members?.key !== "members" || members.status !== "ok") return;
    expect(members.data.byRole).toEqual([
      { key: "R1", count: 30 },
      { key: "R2", count: { masked: true } },
    ]);
    expect(members.data.byGraduationYear).toEqual([{ key: "2020", count: 0 }]);
    expect(members.data.signups).toHaveLength(5);
    expect(members.data.signups.at(-1)).toEqual({
      week: "2026-09-28",
      value: 2,
    });
    // Totals are volume, not a group of people: never masked.
    expect(members.data.verification.rejected).toBe(1);
  });

  it("a failing section is unavailable and the others still return", async () => {
    const boom = new Error("db down");
    const { get, onSectionFailed } = setup(
      [V, PERMISSIONS.JOB_APPROVE, PERMISSIONS.EVENT_CREATE],
      {
        jobsSection: async () => {
          throw boom;
        },
      }
    );
    const { sections } = await get({ actor });
    expect(sections).toEqual([
      { key: "jobs", status: "unavailable" },
      expect.objectContaining({ key: "events", status: "ok" }),
    ]);
    expect(onSectionFailed).toHaveBeenCalledWith("jobs", boom);
  });
});
