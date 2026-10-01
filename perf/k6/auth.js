// Authentication (strategy §13.2): POST /api/auth/sign-in/email. scrypt hashing is CPU-heavy by design
// ("intentionally long", SRS §47), so this measures sign-ins per second per instance and their CPU cost, with
// its own latency budget rather than the 500 ms p95.
//
// Not measured here: the session read. The app never calls /api/auth/get-session over HTTP (getActor() calls
// Better Auth in-process), so every other scenario already pays it; over HTTP that endpoint sits behind Better
// Auth's default per-IP limiter (100 per 10 s), which a single load generator only measures itself against.
// Each sign-in comes from its own client address (x-forwarded-for, as behind the platform proxy), so the
// sign-in limiter (10/min per IP) is not what is measured either; it has its own tests.
import http from "k6/http";
import { check } from "k6";
import exec from "k6/execution";

import {
  arrival,
  BASE,
  fixture,
  perEndpoint,
  summaryTrendStats,
} from "./lib.js";

const SIGN_IN = "POST /api/auth/sign-in/email";

export const options = {
  scenarios: { signIn: arrival({ rate: 10 }) },
  thresholds: perEndpoint([SIGN_IN], {
    [`http_req_failed{name:${SIGN_IN}}`]: ["rate<0.001"],
    // Recorded, not an SRS budget: hashing is meant to be slow.
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
  check(res, { 200: (r) => r.status === 200 });
}
