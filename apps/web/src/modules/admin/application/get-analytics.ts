import { PERMISSIONS, type Permission } from "@nitap/database/permissions";

import type { Actor } from "@/modules/auth";

import {
  analyticsSections,
  analyticsWindow,
  fillWeeks,
  maskBuckets,
  parseRange,
  type AnalyticsRange,
  type AnalyticsSection,
  type AnalyticsWindow,
  type SectionKey,
} from "../domain/analytics";
import type { AnalyticsStore } from "./admin-store";
import type { Authorize } from "./authorize-port";

type OkSection = Extract<AnalyticsSection, { status: "ok" }>;

function loader(
  store: AnalyticsStore,
  key: SectionKey,
  w: AnalyticsWindow
): Promise<OkSection> {
  switch (key) {
    case "members":
      return store.membersSection(w).then((raw) => ({
        key,
        status: "ok",
        data: {
          ...raw,
          signups: fillWeeks(raw.signups, w),
          byRole: maskBuckets(raw.byRole),
          byGraduationYear: maskBuckets(raw.byGraduationYear),
        },
      }));
    case "jobs":
      return store.jobsSection(w).then((raw) => ({
        key,
        status: "ok",
        data: {
          submitted: fillWeeks(raw.submitted, w),
          byStatus: maskBuckets(raw.byStatus),
          openByEmploymentType: maskBuckets(raw.openByEmploymentType),
        },
      }));
    case "events":
      return store
        .eventsSection(w)
        .then((data) => ({ key, status: "ok", data }));
    case "donations":
      return store.donationsSection(w).then((raw) => ({
        key,
        status: "ok",
        data: {
          ...raw,
          receivedRupees: fillWeeks(raw.receivedRupees, w),
          donorsByCampaign: maskBuckets(raw.donorsByCampaign),
        },
      }));
    case "community":
      return store.communitySection(w).then((raw) => ({
        key,
        status: "ok",
        data: {
          posts: fillWeeks(raw.posts, w),
          comments: fillWeeks(raw.comments, w),
          reportsByStatus: maskBuckets(raw.reportsByStatus),
        },
      }));
  }
}

/**
 * Aggregates only, one section per permission held alongside `analytics.view`. A failed section shows
 * "Unavailable" without taking the page down.
 */
export function createGetAnalytics(deps: {
  store: AnalyticsStore;
  authorize: Authorize;
  can: (actor: Actor, permission: Permission) => boolean;
  now?: () => Date;
  onSectionFailed?: (key: SectionKey, error: unknown) => void;
}) {
  const now = deps.now ?? (() => new Date());
  return async function getAnalytics(args: {
    actor: Actor | null;
    range?: unknown;
  }): Promise<{ range: AnalyticsRange; sections: AnalyticsSection[] }> {
    const actor = deps.authorize(args.actor, PERMISSIONS.ANALYTICS_VIEW);
    const range = parseRange(args.range);
    const window = analyticsWindow(range, now());
    const keys = analyticsSections((p) => deps.can(actor, p));

    const settled = await Promise.allSettled(
      keys.map((key) => loader(deps.store, key, window))
    );
    const sections = keys.map((key, i): AnalyticsSection => {
      const result = settled[i]!;
      if (result.status === "fulfilled") return result.value;
      deps.onSectionFailed?.(key, result.reason);
      return { key, status: "unavailable" };
    });
    return { range, sections };
  };
}
export type GetAnalytics = ReturnType<typeof createGetAnalytics>;
