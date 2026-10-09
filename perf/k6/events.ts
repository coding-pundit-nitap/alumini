// Event registration spike: SPIKE_USERS distinct members register for one event
// within ~10 s. Passes when capacity is respected exactly (201 × capacity, 409 EVENT_FULL for the rest), there is
// no 5xx storm, and latency stays bounded. The runner resets the target event before each run (--reset-spike).
// This is where the pool question is answered: production keeps a 2 s pool wait (maxWaitMs).
import http from "k6/http";
import type { Options } from "k6/options";
import { check } from "k6";
import exec from "k6/execution";
import { Counter } from "k6/metrics";

import {
  as,
  BASE,
  fixture,
  loadUserAt,
  loadUsers,
  perEndpoint,
  summaryTrendStats,
  uuid,
} from "./lib.ts";

const users = Math.min(Number(__ENV.SPIKE_USERS || 1000), loadUsers.length);
const registered = new Counter("registrations_created");
const full = new Counter("registrations_full");
const serverErrors = new Counter("server_errors");

// 201 and 409 are both correct answers in a spike (200 is the teardown read); anything else is a failure.
http.setResponseCallback(http.expectedStatuses(200, 201, 409));

export const options: Options = {
  scenarios: {
    spike: {
      executor: "ramping-arrival-rate",
      startRate: 0,
      timeUnit: "1s",
      // One VU per arrival up front: starting VUs mid-spike dropped ~15 % of arrivals in the first runs.
      preAllocatedVUs: users,
      maxVUs: users + 200,
      // ~users arrivals in 10 s: ramp to the peak in 3 s, hold, then stop.
      stages: [
        { target: Math.ceil(users / 8.5), duration: "3s" },
        { target: Math.ceil(users / 8.5), duration: "7s" },
      ],
    },
  },
  thresholds: perEndpoint(["POST /api/v1/events/:id/registrations"], {
    server_errors: ["count==0"],
    http_req_failed: ["rate==0"],
    http_req_duration: ["p(95)<2000"],
  }),
  summaryTrendStats,
};

export default function () {
  const n = exec.scenario.iterationInTest;
  if (n >= users) return; // each member registers once
  const user = loadUserAt(n);
  const res = http.post(
    `${BASE}/api/v1/events/${fixture.spikeEvent.id}/registrations`,
    "{}",
    as(user, {
      headers: {
        "content-type": "application/json",
        "idempotency-key": uuid(),
      },
      tags: { name: "POST /api/v1/events/:id/registrations" },
    })
  );
  if (res.status === 201) registered.add(1);
  else if (res.status === 409) full.add(1);
  else if (res.status >= 500) serverErrors.add(1);
  check(res, {
    "201 or 409": (r: { status: number }) =>
      r.status === 201 || r.status === 409,
  });
}

export function teardown() {
  // The capacity check: read the event back as any member.
  const res = http.get(
    `${BASE}/api/v1/events/${fixture.spikeEvent.id}`,
    as(loadUserAt(0))
  );
  const count = res.json("data.registeredCount");
  console.log(
    `registeredCount=${count} capacity=${fixture.spikeEvent.capacity}`
  );
  check(res, {
    "capacity respected exactly": () =>
      count === Math.min(fixture.spikeEvent.capacity, users),
  });
}
