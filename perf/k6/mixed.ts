// Mixed load.'s user model: 1 000 concurrent active members, one
// request each every ~10 s → ~100 requests/s, in the proportions below (page renders and the bell's poll
// dominate). RATE sets the arrival rate; STRESS=1 keeps raising it until the run is stopped or a budget breaks,
// to find the breaking point and the first bottleneck.
import http from "k6/http";
import type { RefinedResponse, ResponseType } from "k6/http";
import type { Options } from "k6/options";
import { check } from "k6";

import {
  anyUser,
  arrival,
  as,
  BASE,
  conversationsOf,
  type IndexedUser,
  fixture,
  pick,
  SRS_THRESHOLDS,
  perEndpoint,
  summaryTrendStats,
} from "./lib.ts";

const stress = __ENV.STRESS === "1";
const peak = Number(__ENV.RATE || 100);

type Run = (u: IndexedUser) => RefinedResponse<ResponseType | undefined>;

const MIX: [name: string, weight: number, run: Run][] = [
  [
    "page /dashboard",
    15,
    (u) =>
      http.get(
        `${BASE}/dashboard`,
        as(u, { tags: { name: "page /dashboard" } })
      ),
  ],
  [
    "page /feed",
    8,
    (u) => http.get(`${BASE}/feed`, as(u, { tags: { name: "page /feed" } })),
  ],
  [
    "page /members/:id",
    7,
    (u) =>
      http.get(
        `${BASE}/members/${pick(fixture.profileUserIds)}`,
        as(u, { tags: { name: "page /members/:id" } })
      ),
  ],
  [
    "page /jobs",
    5,
    (u) => http.get(`${BASE}/jobs`, as(u, { tags: { name: "page /jobs" } })),
  ],
  [
    "GET /api/v1/notifications/unread-count",
    25,
    (u) =>
      http.get(
        `${BASE}/api/v1/notifications/unread-count`,
        as(u, { tags: { name: "GET /api/v1/notifications/unread-count" } })
      ),
  ],
  [
    "GET /api/v1/posts",
    10,
    (u) =>
      http.get(
        `${BASE}/api/v1/posts?limit=20`,
        as(u, { tags: { name: "GET /api/v1/posts" } })
      ),
  ],
  [
    "GET /api/v1/alumni",
    8,
    (u) =>
      http.get(
        `${BASE}/api/v1/alumni?limit=20&department=${pick(fixture.departmentCodes)}`,
        as(u, { tags: { name: "GET /api/v1/alumni" } })
      ),
  ],
  [
    "GET /api/v1/alumni?q",
    5,
    (u) =>
      http.get(
        `${BASE}/api/v1/alumni?limit=20&q=${encodeURIComponent(pick(fixture.searchTerms))}`,
        as(u, { tags: { name: "GET /api/v1/alumni?q" } })
      ),
  ],
  [
    "GET /api/v1/conversations",
    7,
    (u) =>
      http.get(
        `${BASE}/api/v1/conversations?limit=20`,
        as(u, { tags: { name: "GET /api/v1/conversations" } })
      ),
  ],
  [
    "GET /api/v1/conversations/:id/messages",
    5,
    (u) => {
      const list = conversationsOf(u.index);
      if (list.length === 0)
        return http.get(
          `${BASE}/api/v1/conversations?limit=20`,
          as(u, { tags: { name: "GET /api/v1/conversations" } })
        );
      return http.get(
        `${BASE}/api/v1/conversations/${pick(list)}/messages?limit=30`,
        as(u, { tags: { name: "GET /api/v1/conversations/:id/messages" } })
      );
    },
  ],
  [
    "GET /api/v1/events",
    5,
    (u) =>
      http.get(
        `${BASE}/api/v1/events?limit=20`,
        as(u, { tags: { name: "GET /api/v1/events" } })
      ),
  ],
];
export const options: Options = {
  scenarios: {
    mixed: stress
      ? {
          executor: "ramping-arrival-rate",
          startRate: 10,
          timeUnit: "1s",
          preAllocatedVUs: 200,
          maxVUs: 3000,
          // +STEP requests/s every STEP_EVERY until MAX.
          stages: Array.from(
            {
              length: Math.ceil(
                Number(__ENV.MAX || 600) / Number(__ENV.STEP || 50)
              ),
            },
            (_, i) => ({
              target: (i + 1) * Number(__ENV.STEP || 50),
              duration: __ENV.STEP_EVERY || "1m",
            })
          ),
        }
      : arrival({ rate: peak, duration: "10m", ramp: "1m" }),
  },
  // In a stress run the budgets are expected to break; abort once they clearly have.
  thresholds: perEndpoint(
    [...new Set(MIX.map(([name]) => name))],
    stress
      ? {
          http_req_duration: [
            {
              threshold: "p(95)<2000",
              abortOnFail: true,
              delayAbortEval: "30s",
            },
          ],
          http_req_failed: [
            {
              threshold: "rate<0.05",
              abortOnFail: true,
              delayAbortEval: "30s",
            },
          ],
        }
      : SRS_THRESHOLDS
  ),
  summaryTrendStats,
};

const total = MIX.reduce((sum, [, w]) => sum + w, 0);

export default function () {
  let roll = Math.random() * total;
  const user = anyUser();
  for (const [, weight, run] of MIX) {
    roll -= weight;
    if (roll < 0) {
      check(run(user), { 200: (r: { status: number }) => r.status === 200 });
      return;
    }
  }
}
