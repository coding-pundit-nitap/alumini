// Rendered pages (strategy §13.2): full RSC renders through `next start`. Anonymous landing and login answer the
// TASK.md note "the root Header calls getActor() for the bell, so every page is dynamic"; the signed-in pages
// are the ones members open most. PAGE=<path> restricts the run to one page, for before/after comparisons.
import http from "k6/http";
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
} from "./lib.js";

const PAGES = [
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
export const options = {
  scenarios: { pages: arrival({ rate: 20 }) },
  thresholds: perEndpoint(
    PAGES.map((p) => `page ${p.path}`),
    SRS_THRESHOLDS
  ),
  summaryTrendStats,
};

const total = PAGES.reduce((sum, p) => sum + p.weight, 0);

function choose() {
  let roll = Math.random() * total;
  for (const page of PAGES) {
    roll -= page.weight;
    if (roll < 0) return page;
  }
  return PAGES[PAGES.length - 1];
}

export default function () {
  const page = choose();
  const url =
    BASE + page.path.replace(":id", () => pick(fixture.profileUserIds));
  const tags = { name: `page ${page.path}` };
  const res = page.signedIn
    ? http.get(url, as(anyUser(), { tags }))
    : http.get(url, { tags, redirects: 0 });
  check(res, { 200: (r) => r.status === 200 });
}
