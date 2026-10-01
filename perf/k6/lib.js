// Shared by every scenario (Phase 15; strategy §13). Run through `node scripts/perf/run.mjs <scenario>`, which
// mounts this directory at /perf in the k6 container and passes BASE_URL, RATE, DURATION and RAMP.
import { SharedArray } from "k6/data";

export const BASE = __ENV.BASE_URL || "http://localhost:3100";

const FIXTURE = "/perf/.data/fixture.json";
// SharedArray keeps one copy for all VUs instead of one per VU (2 000 cookies × hundreds of VUs).
export const loadUsers = new SharedArray(
  "loadUsers",
  () => JSON.parse(open(FIXTURE)).loadUsers
);
const small = JSON.parse(open(FIXTURE));
delete small.loadUsers;
delete small.conversationsByUser;
export const fixture = small;
export const conversations = new SharedArray("conversations", () => {
  const all = JSON.parse(open(FIXTURE));
  return all.loadUsers.map((u) => all.conversationsByUser[u.userId] || []);
});

export const pick = (items) => items[Math.floor(Math.random() * items.length)];
export const randomIndex = (n) => Math.floor(Math.random() * n);

/** A random load user, with its index (to look up its conversations). */
export function anyUser() {
  const index = randomIndex(loadUsers.length);
  return { index, ...loadUsers[index] };
}

/** Request params for a signed-in member. Origin is what `assertSameOrigin` checks on writes. */
export function as(user, extra = {}) {
  return {
    headers: {
      cookie: `${fixture.cookieName}=${user.cookie}`,
      origin: BASE,
      ...(extra.headers || {}),
    },
    tags: extra.tags || {},
    redirects: 0,
  };
}

export function uuid() {
  const hex = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < 36; i += 1) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += "-";
    else if (i === 14) out += "4";
    else if (i === 19) out += hex[8 + randomIndex(4)];
    else out += hex[randomIndex(16)];
  }
  return out;
}

/**
 * SRS §47 (strategy §13.1): p50 < 200 ms, p95 < 500 ms, p99 < 1 s, error rate < 0.1 %. In the script, so a run
 * that breaks a budget exits non-zero (strategy §13.3).
 */
export const SRS_THRESHOLDS = {
  http_req_duration: ["p(50)<200", "p(95)<500", "p(99)<1000"],
  http_req_failed: ["rate<0.001"],
};

/**
 * Open model (strategy §13.3): requests arrive at RATE per second whether or not the server keeps up, so a slow
 * server shows up as latency, not as fewer requests. Ramps for RAMP, holds for DURATION.
 */
export function arrival(defaults) {
  const rate = Number(__ENV.RATE || defaults.rate);
  const ramp = __ENV.RAMP || defaults.ramp || "30s";
  const hold = __ENV.DURATION || defaults.duration || "3m";
  return {
    executor: "ramping-arrival-rate",
    startRate: 1,
    timeUnit: "1s",
    preAllocatedVUs: Math.max(20, rate),
    maxVUs: Math.max(200, rate * 10),
    stages: [
      { target: rate, duration: ramp },
      { target: rate, duration: hold },
    ],
  };
}

export const summaryTrendStats = [
  "avg",
  "min",
  "med",
  "p(90)",
  "p(95)",
  "p(99)",
  "max",
  "count",
];

/**
 * Non-failing thresholds on each endpoint's tag, so the end-of-run summary (and the runner's result file)
 * carries p50/p95/p99, throughput and error rate per endpoint, not only for the whole run.
 */
export function perEndpoint(names, thresholds) {
  const out = { ...thresholds };
  for (const name of names) {
    out[`http_req_duration{name:${name}}`] = out[
      `http_req_duration{name:${name}}`
    ] || ["max>=0"];
    out[`http_req_failed{name:${name}}`] = out[
      `http_req_failed{name:${name}}`
    ] || ["rate>=0"];
    out[`http_reqs{name:${name}}`] = ["count>=0"];
  }
  return out;
}
