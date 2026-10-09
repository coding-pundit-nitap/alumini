// Directory browse + filters (strategy §13.2): GET /api/v1/alumni without a search term. The heaviest read:
// filters, per-viewer visibility and block checks, keyset pagination.
import http from "k6/http";
import type { Options } from "k6/options";
import { check } from "k6";

import {
  anyUser,
  arrival,
  as,
  BASE,
  fixture,
  pick,
  SRS_THRESHOLDS,
  perEndpoint,
  summaryTrendStats,
} from "./lib.ts";

export const options: Options = {
  scenarios: { directory: arrival({ rate: 50 }) },
  thresholds: perEndpoint(
    ["GET /api/v1/alumni", "GET /api/v1/alumni (next page)"],
    SRS_THRESHOLDS
  ),
  summaryTrendStats,
};

const thisYear = new Date().getUTCFullYear();

function filters() {
  const roll = Math.random();
  if (roll < 0.35) return "sort=name";
  if (roll < 0.55) return `department=${pick(fixture.departmentCodes)}`;
  if (roll < 0.7) {
    const from = 2010 + Math.floor(Math.random() * (thisYear - 2014));
    return `graduationYearFrom=${from}&graduationYearTo=${from + 3}&sort=-graduationYear`;
  }
  if (roll < 0.8)
    return `department=${pick(fixture.departmentCodes)}&graduationYear=${2012 + Math.floor(Math.random() * 12)}`;
  if (roll < 0.9) return "sort=-graduationYear";
  return `company=${encodeURIComponent(pick(["Infosys", "Google", "ISRO", "NTPC", "Zoho"]))}`;
}

export default function () {
  const user = anyUser();
  const tags = { name: "GET /api/v1/alumni" };
  const first = http.get(
    `${BASE}/api/v1/alumni?limit=20&${filters()}`,
    as(user, { tags })
  );
  check(first, { 200: (r: { status: number }) => r.status === 200 });
  // A third of visitors page on once.
  if (first.status === 200 && Math.random() < 0.3) {
    const next = first.json("page.nextCursor") as string | null;
    if (next) {
      const more = http.get(
        `${first.url}&cursor=${encodeURIComponent(next)}`,
        as(user, { tags: { name: "GET /api/v1/alumni (next page)" } })
      );
      check(more, { 200: (r: { status: number }) => r.status === 200 });
    }
  }
}
