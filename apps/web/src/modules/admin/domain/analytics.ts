import { PERMISSIONS, type Permission } from "@nitap/database/permissions";

import type { Can } from "./access";

/** The three windows the page offers; anything else falls back to 30 days. */
export const ANALYTICS_RANGES = ["30d", "90d", "365d"] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];
export const RANGE_DAYS: Record<AnalyticsRange, number> = {
  "30d": 30,
  "90d": 90,
  "365d": 365,
};

export const parseRange = (value: unknown): AnalyticsRange =>
  ANALYTICS_RANGES.includes(value as AnalyticsRange)
    ? (value as AnalyticsRange)
    : "30d";

const DAY_MS = 24 * 60 * 60 * 1000;

/** `[from, to)` ending now. */
export type AnalyticsWindow = { from: Date; to: Date };
export const analyticsWindow = (
  range: AnalyticsRange,
  now: Date
): AnalyticsWindow => ({
  from: new Date(now.getTime() - RANGE_DAYS[range] * DAY_MS),
  to: now,
});

export type SectionKey =
  "members" | "jobs" | "events" | "community" | "donations";

/** / a section needs `analytics.view` and the permission that owns its data. */
export const SECTION_PERMISSIONS: Record<SectionKey, Permission> = {
  members: PERMISSIONS.ALUMNI_VERIFY,
  jobs: PERMISSIONS.JOB_APPROVE,
  events: PERMISSIONS.EVENT_CREATE,
  community: PERMISSIONS.REPORT_REVIEW,
  donations: PERMISSIONS.DONATION_VIEW_ALL,
};

export const analyticsSections = (can: Can): SectionKey[] =>
  can(PERMISSIONS.ANALYTICS_VIEW)
    ? (Object.keys(SECTION_PERMISSIONS) as SectionKey[]).filter((key) =>
        can(SECTION_PERMISSIONS[key])
      )
    : [];

/** Breakdown buckets of 1–4 are suppressed so no bucket identifies a person. */
export const SUPPRESS_BELOW = 5;
export type Count = number | { masked: true };
export const mask = (n: number): Count =>
  n > 0 && n < SUPPRESS_BELOW ? { masked: true } : n;

export type Bucket = { key: string; value: number };
export type MaskedBucket = { key: string; count: Count };
export const maskBuckets = (rows: readonly Bucket[]): MaskedBucket[] =>
  rows.map((r) => ({ key: r.key, count: mask(r.value) }));

/** A week is named by its Monday in IST, `YYYY-MM-DD` (what `date_trunc('week', … AT TIME ZONE 'Asia/Kolkata')` gives). */
export type WeekPoint = { week: string; value: number };

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

export function istWeekOf(at: Date): string {
  const local = new Date(at.getTime() + IST_OFFSET_MS);
  const sinceMonday = (local.getUTCDay() + 6) % 7;
  const monday = new Date(local.getTime() - sinceMonday * DAY_MS);
  return monday.toISOString().slice(0, 10);
}

/** One point per IST week touching `[from, to]`, oldest first; weeks with no rows are 0. */
export function fillWeeks(
  rows: readonly WeekPoint[],
  window: AnalyticsWindow
): WeekPoint[] {
  const byWeek = new Map(rows.map((r) => [r.week, r.value]));
  const last = istWeekOf(window.to);
  const out: WeekPoint[] = [];
  let week = istWeekOf(window.from);
  while (week <= last) {
    out.push({ week, value: byWeek.get(week) ?? 0 });
    week = new Date(Date.parse(week) + 7 * DAY_MS).toISOString().slice(0, 10);
  }
  return out;
}

// --- Raw rows from the store ---

export type MembersRaw = {
  byState: Record<string, number>;
  signups: WeekPoint[];
  byRole: Bucket[];
  byGraduationYear: Bucket[];
  verification: {
    approved: number;
    rejected: number;
    medianHoursToReview: number | null;
  };
};
export type JobsRaw = {
  submitted: WeekPoint[];
  byStatus: Bucket[];
  openByEmploymentType: Bucket[];
};
export type EventsRaw = {
  held: number;
  cancelled: number;
  registrations: number;
  /** 0 … 1, or null when no held event had capacity. */
  averageFillRate: number | null;
  upcoming: number;
};
export type CommunityRaw = {
  posts: WeekPoint[];
  comments: WeekPoint[];
  reportsByStatus: Bucket[];
};

/** Confirmed money only. Weekly values are whole rupees; the per-campaign bucket counts donors. */
export type DonationsRaw = {
  receivedRupees: WeekPoint[];
  raisedPaise: number;
  donors: number;
  donorsByCampaign: Bucket[];
};

// --- What the page renders ---

export type MembersData = Omit<MembersRaw, "byRole" | "byGraduationYear"> & {
  byRole: MaskedBucket[];
  byGraduationYear: MaskedBucket[];
};
export type JobsData = Omit<JobsRaw, "byStatus" | "openByEmploymentType"> & {
  byStatus: MaskedBucket[];
  openByEmploymentType: MaskedBucket[];
};
export type EventsData = EventsRaw;
export type CommunityData = Omit<CommunityRaw, "reportsByStatus"> & {
  reportsByStatus: MaskedBucket[];
};

export type DonationsData = Omit<DonationsRaw, "donorsByCampaign"> & {
  donorsByCampaign: MaskedBucket[];
};

export type AnalyticsSection =
  | { key: "members"; status: "ok"; data: MembersData }
  | { key: "jobs"; status: "ok"; data: JobsData }
  | { key: "events"; status: "ok"; data: EventsData }
  | { key: "community"; status: "ok"; data: CommunityData }
  | { key: "donations"; status: "ok"; data: DonationsData }
  | { key: SectionKey; status: "unavailable" };
