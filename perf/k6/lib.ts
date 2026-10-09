// Shared by every scenario. Run through `node packages/scripts/perf/run.ts <scenario>`, which
// mounts this directory at /perf in the k6 container and passes BASE_URL, RATE, DURATION and RAMP.
import { SharedArray } from "k6/data";
import type { Options, Scenario } from "k6/options";
import type { RefinedParams, ResponseType } from "k6/http";

export const BASE = __ENV.BASE_URL || "http://localhost:3100";

const FIXTURE = "/perf/.data/fixture.json";

/** `perf/.data/fixture.json`, as written by `apps/web/scripts/perf-seed.ts` (shape: `PerfFixture` in packages/database/perf/generate.ts). */
export type LoadUser = { userId: string; email: string; cookie: string };
export type Fixture = {
  password: string;
  cookieName: string;
  spikeEvent: { id: string; capacity: number };
  upcomingEventIds: string[];
  publishedJobIds: string[];
  profileUserIds: string[];
  signInEmails: string[];
  searchTerms: string[];
  departmentCodes: string[];
};
type FixtureFile = Fixture & {
  loadUsers: LoadUser[];
  conversationsByUser: Record<string, string[]>;
};
// SharedArray keeps one copy for all VUs instead of one per VU (2 000 cookies × hundreds of VUs).
export const loadUsers = new SharedArray<LoadUser>(
  "loadUsers",
  () => (JSON.parse(open(FIXTURE)) as FixtureFile).loadUsers
);
const {
  loadUsers: _users,
  conversationsByUser: _conversations,
  ...small
} = JSON.parse(open(FIXTURE)) as FixtureFile;
export const fixture: Fixture = small;
export const conversations = new SharedArray<string[]>("conversations", () => {
  const all = JSON.parse(open(FIXTURE)) as FixtureFile;
  return all.loadUsers.map((u) => all.conversationsByUser[u.userId] || []);
});

export const pick = <T>(items: readonly T[]): T =>
  items[Math.floor(Math.random() * items.length)] as T;
export const randomIndex = (n: number): number => Math.floor(Math.random() * n);

/** A random load user, with its index (to look up its conversations). */
/** Strict-index helpers: `loadUsers[i]` is `LoadUser | undefined` under noUncheckedIndexedAccess. */
export const loadUserAt = (index: number): LoadUser =>
  loadUsers[index] as LoadUser;
export const conversationsOf = (index: number): string[] =>
  conversations[index] ?? [];

export type IndexedUser = LoadUser & { index: number };
export function anyUser(): IndexedUser {
  const index = randomIndex(loadUsers.length);
  return { index, ...loadUserAt(index) };
}

/** Request params for a signed-in member. Origin is what `assertSameOrigin` checks on writes. */
export function as(
  user: LoadUser,
  extra: {
    headers?: Record<string, string>;
    tags?: Record<string, string>;
  } = {}
): RefinedParams<ResponseType | undefined> {
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

export function uuid(): string {
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

/** p50 < 200 ms, p95 < 500 ms, p99 < 1 s, errors < 0.1%. A breach exits non-zero. */
export const SRS_THRESHOLDS: NonNullable<Options["thresholds"]> = {
  http_req_duration: ["p(50)<200", "p(95)<500", "p(99)<1000"],
  http_req_failed: ["rate<0.001"],
};

/** Open model: requests arrive at RATE regardless of server speed, so slowness shows as latency. */
export function arrival(defaults: {
  rate: number;
  ramp?: string;
  duration?: string;
}): Scenario {
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

export const summaryTrendStats: string[] = [
  "avg",
  "min",
  "med",
  "p(90)",
  "p(95)",
  "p(99)",
  "max",
  "count",
];

/** Non-failing per-endpoint thresholds, so the summary reports each endpoint. */
export function perEndpoint(
  names: readonly string[],
  thresholds: NonNullable<Options["thresholds"]>
): NonNullable<Options["thresholds"]> {
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
