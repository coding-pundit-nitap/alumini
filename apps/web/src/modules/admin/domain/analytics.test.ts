import { describe, expect, it } from "vitest";
import { PERMISSIONS, type Permission } from "@nitap/database/permissions";

import {
  analyticsSections,
  analyticsWindow,
  fillWeeks,
  istWeekOf,
  mask,
  parseRange,
} from "./analytics";

const holding =
  (...held: Permission[]) =>
  (p: Permission) =>
    held.includes(p);

describe("parseRange", () => {
  it("accepts the three ranges and defaults anything else to 30d", () => {
    expect(parseRange("90d")).toBe("90d");
    expect(parseRange("365d")).toBe("365d");
    for (const v of [undefined, "", "7d", ["90d"], 90])
      expect(parseRange(v)).toBe("30d");
  });
});

describe("analyticsSections (permissions, never roles)", () => {
  const V = PERMISSIONS.ANALYTICS_VIEW;

  it("T&P-like holders see jobs and events", () => {
    expect(
      analyticsSections(
        holding(V, PERMISSIONS.JOB_APPROVE, PERMISSIONS.EVENT_CREATE)
      )
    ).toEqual(["jobs", "events"]);
  });

  it("coordinator-like holders see members and events", () => {
    expect(
      analyticsSections(
        holding(V, PERMISSIONS.ALUMNI_VERIFY, PERMISSIONS.EVENT_CREATE)
      )
    ).toEqual(["members", "events"]);
  });

  it("institute-like holders see all four", () => {
    expect(
      analyticsSections(
        holding(
          V,
          PERMISSIONS.ALUMNI_VERIFY,
          PERMISSIONS.JOB_APPROVE,
          PERMISSIONS.EVENT_CREATE,
          PERMISSIONS.REPORT_REVIEW
        )
      )
    ).toEqual(["members", "jobs", "events", "community"]);
  });

  it("gives nothing without analytics.view, whatever else is held", () => {
    expect(
      analyticsSections(
        holding(PERMISSIONS.REPORT_REVIEW, PERMISSIONS.JOB_APPROVE)
      )
    ).toEqual([]);
  });
});

describe("mask (small-count suppression)", () => {
  it("keeps 0 and 5+, masks 1–4", () => {
    expect(mask(0)).toBe(0);
    expect(mask(1)).toEqual({ masked: true });
    expect(mask(4)).toEqual({ masked: true });
    expect(mask(5)).toBe(5);
  });
});

describe("IST weeks", () => {
  it("names a week by its IST Monday, across the UTC day boundary", () => {
    // Sunday 2026-09-27 19:00 UTC is Monday 00:30 IST.
    expect(istWeekOf(new Date("2026-09-27T19:00:00Z"))).toBe("2026-09-28");
    expect(istWeekOf(new Date("2026-09-27T18:00:00Z"))).toBe("2026-09-21");
  });

  it("fills missing weeks with 0, oldest first, one point per week of the range", () => {
    const window = analyticsWindow("30d", new Date("2026-10-01T06:00:00Z"));
    const weeks = fillWeeks(
      [
        { week: "2026-09-14", value: 3 },
        { week: "2026-09-28", value: 1 },
      ],
      window
    );
    expect(weeks).toEqual([
      { week: "2026-08-31", value: 0 },
      { week: "2026-09-07", value: 0 },
      { week: "2026-09-14", value: 3 },
      { week: "2026-09-21", value: 0 },
      { week: "2026-09-28", value: 1 },
    ]);
  });

  it("covers a year with 53 or 54 points", () => {
    const n = fillWeeks(
      [],
      analyticsWindow("365d", new Date("2026-10-01T06:00:00Z"))
    ).length;
    expect(n).toBeGreaterThanOrEqual(53);
    expect(n).toBeLessThanOrEqual(54);
  });
});
