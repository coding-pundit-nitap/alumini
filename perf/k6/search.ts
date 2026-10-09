// Search (strategy §13.2): GET /api/v1/alumni?q=… — the trigram/ILIKE paths over names, headlines, companies and
// skills, including substrings and one-letter typos. Decides when OpenSearch is justified (TDS §14).
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
  scenarios: { search: arrival({ rate: 30 }) },
  thresholds: perEndpoint(["GET /api/v1/alumni?q"], SRS_THRESHOLDS),
  summaryTrendStats,
};

export default function () {
  const user = anyUser();
  const q = encodeURIComponent(pick(fixture.searchTerms));
  const withDepartment =
    Math.random() < 0.2 ? `&department=${pick(fixture.departmentCodes)}` : "";
  const res = http.get(
    `${BASE}/api/v1/alumni?limit=20&q=${q}${withDepartment}`,
    as(user, { tags: { name: "GET /api/v1/alumni?q" } })
  );
  check(res, { 200: (r: { status: number }) => r.status === 200 });
}
