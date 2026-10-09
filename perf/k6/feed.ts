// Feed (strategy §13.2): GET /api/v1/posts — keyset pagination and per-viewer joins (reactions, blocks).
import http from "k6/http";
import type { Options } from "k6/options";
import { check } from "k6";

import {
  anyUser,
  arrival,
  as,
  BASE,
  SRS_THRESHOLDS,
  perEndpoint,
  summaryTrendStats,
} from "./lib.ts";

export const options: Options = {
  scenarios: { feed: arrival({ rate: 50 }) },
  thresholds: perEndpoint(
    ["GET /api/v1/posts", "GET /api/v1/posts (next page)"],
    SRS_THRESHOLDS
  ),
  summaryTrendStats,
};

export default function () {
  const user = anyUser();
  const first = http.get(
    `${BASE}/api/v1/posts?limit=20`,
    as(user, { tags: { name: "GET /api/v1/posts" } })
  );
  check(first, { 200: (r: { status: number }) => r.status === 200 });
  if (first.status === 200 && Math.random() < 0.3) {
    const next = first.json("nextCursor") as string | null;
    if (next) {
      const more = http.get(
        `${BASE}/api/v1/posts?limit=20&cursor=${encodeURIComponent(next)}`,
        as(user, { tags: { name: "GET /api/v1/posts (next page)" } })
      );
      check(more, { 200: (r: { status: number }) => r.status === 200 });
    }
  }
}
