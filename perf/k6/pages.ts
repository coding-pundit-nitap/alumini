// Full server renders through `next start`. PAGE=<path> restricts the run to one page.
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

type Page = { path: string; signedIn: boolean; weight: number };

const PAGES: Page[] = [
  { path: "/", signedIn: false, weight: 10 },
  { path: "/login", signedIn: false, weight: 5 },
  { path: "/dashboard", signedIn: true, weight: 25 },
  { path: "/feed", signedIn: true, weight: 15 },
  { path: "/directory", signedIn: true, weight: 10 },
  { path: "/members/:id", signedIn: true, weight: 10 },
  { path: "/jobs", signedIn: true, weight: 10 },
  { path: "/events", signedIn: true, weight: 10 },
  { path: "/notifications", signedIn: true, weight: 5 },
].filter((p) => !__ENV.PAGE || p.path === __ENV.PAGE);
export const options: Options = {
  scenarios: { pages: arrival({ rate: 20 }) },
  thresholds: perEndpoint(
    PAGES.map((p) => `page ${p.path}`),
    SRS_THRESHOLDS
  ),
  summaryTrendStats,
};

const total = PAGES.reduce((sum, p) => sum + p.weight, 0);

function choose(): Page {
  let roll = Math.random() * total;
  for (const page of PAGES) {
    roll -= page.weight;
    if (roll < 0) return page;
  }
  return PAGES[PAGES.length - 1] as Page;
}

export default function () {
  const page = choose();
  const url =
    BASE + page.path.replace(":id", () => pick(fixture.profileUserIds));
  const tags = { name: `page ${page.path}` };
  const res = page.signedIn
    ? http.get(url, as(anyUser(), { tags }))
    : http.get(url, { tags, redirects: 0 });
  check(res, { 200: (r: { status: number }) => r.status === 200 });
}
