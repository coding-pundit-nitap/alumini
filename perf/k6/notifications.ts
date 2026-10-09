// Notifications: the bell's unread count, polled by every open tab, and the
// inbox list. Fan-out throughput is measured by packages/scripts/perf/fanout.ts, not here.
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
  scenarios: { notifications: arrival({ rate: 100 }) },
  thresholds: perEndpoint(
    ["GET /api/v1/notifications/unread-count", "GET /api/v1/notifications"],
    SRS_THRESHOLDS
  ),
  summaryTrendStats,
};

export default function () {
  const user = anyUser();
  if (Math.random() < 0.8) {
    const res = http.get(
      `${BASE}/api/v1/notifications/unread-count`,
      as(user, { tags: { name: "GET /api/v1/notifications/unread-count" } })
    );
    check(res, { 200: (r: { status: number }) => r.status === 200 });
  } else {
    const res = http.get(
      `${BASE}/api/v1/notifications?limit=20`,
      as(user, { tags: { name: "GET /api/v1/notifications" } })
    );
    check(res, { 200: (r: { status: number }) => r.status === 200 });
  }
}
