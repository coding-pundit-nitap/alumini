// Sign-in throughput and CPU cost. scrypt is deliberately slow, so this has its own latency budget.
// Each sign-in uses its own client address so the per-IP limiter isn't what gets measured.
import http from "k6/http";
import type { Options } from "k6/options";
import { check } from "k6";
import exec from "k6/execution";

import {
  arrival,
  BASE,
  fixture,
  perEndpoint,
  summaryTrendStats,
} from "./lib.ts";

const SIGN_IN = "POST /api/auth/sign-in/email";

export const options: Options = {
  scenarios: { signIn: arrival({ rate: 10 }) },
  thresholds: perEndpoint([SIGN_IN], {
    [`http_req_failed{name:${SIGN_IN}}`]: ["rate<0.001"],
    // Recorded, not a performance budget: hashing is meant to be slow.
    [`http_req_duration{name:${SIGN_IN}}`]: ["p(95)<2000"],
  }),
  summaryTrendStats,
};

export default function () {
  const n = exec.scenario.iterationInTest;
  const email = fixture.signInEmails[n % fixture.signInEmails.length];
  const res = http.post(
    `${BASE}/api/auth/sign-in/email`,
    JSON.stringify({ email, password: fixture.password }),
    {
      headers: {
        "content-type": "application/json",
        origin: BASE,
        "x-forwarded-for": `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`,
      },
      tags: { name: SIGN_IN },
    }
  );
  check(res, { 200: (r: { status: number }) => r.status === 200 });
}
