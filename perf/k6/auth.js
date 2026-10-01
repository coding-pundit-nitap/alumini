// Authentication (strategy §13.2). Two paths with different budgets:
//   sign-in      POST /api/auth/sign-in/email — scrypt hashing is CPU-heavy by design ("intentionally long",
//                SRS §47), so it is measured for its throughput and CPU cost, not held to the 500 ms p95;
//   session read GET /api/auth/get-session   — what every signed-in request pays inside getActor().
// Each sign-in comes from its own client address (x-forwarded-for, as behind the platform proxy), so the
// per-IP limiter (10/min) measures nothing here; it has its own tests.
import http from "k6/http";
import { check } from "k6";
import exec from "k6/execution";

import {
  anyUser,
  arrival,
  as,
  BASE,
  fixture,
  perEndpoint,
  summaryTrendStats,
} from "./lib.js";

const SIGN_IN = "POST /api/auth/sign-in/email";
const SESSION = "GET /api/auth/get-session";

export const options = {
  scenarios: {
    signIn: {
      ...arrival({ rate: Number(__ENV.SIGNIN_RATE || 5) }),
      exec: "signIn",
    },
    session: { ...arrival({ rate: 50 }), exec: "session" },
  },
  thresholds: perEndpoint(
    ["POST /api/auth/sign-in/email", "GET /api/auth/get-session"],
    {
      [`http_req_duration{name:${SESSION}}`]: [
        "p(50)<200",
        "p(95)<500",
        "p(99)<1000",
      ],
      [`http_req_failed{name:${SESSION}}`]: ["rate<0.001"],
      [`http_req_failed{name:${SIGN_IN}}`]: ["rate<0.001"],
      // Recorded, not an SRS budget: hashing is meant to be slow.
      [`http_req_duration{name:${SIGN_IN}}`]: ["p(95)<2000"],
    }
  ),
  summaryTrendStats,
};

export function signIn() {
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

export function session() {
  const res = http.get(
    `${BASE}/api/auth/get-session`,
    as(anyUser(), { tags: { name: SESSION } })
  );
  check(res, {
    "200 with a user": (r) =>
      r.status === 200 && r.json("user.id") !== undefined,
  });
}
