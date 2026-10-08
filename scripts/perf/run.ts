#!/usr/bin/env node
// Load-test runner (Phase 15; strategy §13.3–13.4). Starts the production build against the performance database,
// runs one k6 scenario from the official container, samples the server while it runs, and writes the k6 summary
// plus the samples to docs/operations/perf/data/<date>/<scenario>[-label].json.
//
//   pnpm --filter @nitap/web build
//   pnpm docker:up && set -a && . ./.env && set +a
//   pnpm perf:seed -- --users 10000                      # once; builds alumini_perf and perf/.data/fixture.json
//   node scripts/perf/run.ts directory [--rate 50] [--duration 3m] [--ramp 30s] [--label before] \
//        [--env KEY=VALUE]… [--worker] [--reset-spike] [--smoke] [--server-env KEY=VALUE]…
//
// --smoke runs the strategy's smoke shape (RATE=2, 30 s) and writes nothing. Exit code is k6's: 99 when a
// threshold (an SRS budget) broke.
import { execFileSync, spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

const K6_IMAGE = "grafana/k6:2.3.0";
const root = path.resolve(import.meta.dirname, "../..");
// pg is a dependency of the web app, not of the workspace root.
const pg = createRequire(path.join(root, "apps/web/package.json"))("pg");
const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: {
    rate: { type: "string" },
    duration: { type: "string" },
    ramp: { type: "string" },
    label: { type: "string" },
    env: { type: "string", multiple: true, default: [] },
    "server-env": { type: "string", multiple: true, default: [] },
    port: { type: "string", default: "3100" },
    worker: { type: "boolean", default: false },
    "reset-spike": { type: "boolean", default: false },
    smoke: { type: "boolean", default: false },
    "no-server": { type: "boolean", default: false },
  },
});
const scenario = positionals[0];
if (!scenario) {
  console.error("usage: node scripts/perf/run.ts <scenario> [options]");
  process.exit(2);
}

const runLabel = `${scenario}${args.label ? `-${args.label}` : ""}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const origin = `http://localhost:${args.port}`;
const fixture = JSON.parse(
  readFileSync(path.join(root, "perf/.data/fixture.json"), "utf8")
);
const perfUrl = (() => {
  if (process.env.PERF_DATABASE_URL) return process.env.PERF_DATABASE_URL;
  if (!process.env.DATABASE_URL)
    throw new Error("PERF_DATABASE_URL (or DATABASE_URL) is not set");
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = "/alumini_perf";
  return url.toString();
})();
const dbName = new URL(perfUrl).pathname.slice(1);
const pairs = (list: string[]) =>
  Object.fromEntries(
    list.map((kv) => [
      kv.slice(0, kv.indexOf("=")),
      kv.slice(kv.indexOf("=") + 1),
    ])
  );

// ---- Server under test --------------------------------------------------------------------------------------
const children: ChildProcess[] = [];
const healthToken = "perf-health-token-000000000000";
function start(
  name: string,
  cmd: string,
  argv: string[],
  cwd: string,
  env: Record<string, string | undefined>
) {
  // Server output goes to perf/.data/logs/<run>-<name>.log, so an error during a run can be explained afterwards.
  const logDir = path.join(root, "perf/.data/logs");
  mkdirSync(logDir, { recursive: true });
  const log = openSync(path.join(logDir, `${runLabel}-${name}.log`), "w");
  const child = spawn(cmd, argv, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", log, log],
    // Its own process group: pnpm does not forward SIGTERM, so stopAll() signals the whole group.
    detached: true,
  });
  children.push(child);
  child.once("exit", (code, signal) => {
    if (!stopping) console.error(`${name} exited early (${code ?? signal})`);
  });
  return child;
}
let stopping = false;
async function stopAll() {
  stopping = true;
  for (const child of children) {
    try {
      if (child.pid) process.kill(-child.pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
  await sleep(500);
}
process.on("SIGINT", async () => {
  await stopAll();
  process.exit(130);
});

function redisDb1(value: string | undefined) {
  if (!value) return value;
  const url = new URL(value);
  url.pathname = "/1";
  return url.toString();
}
const serverEnv = {
  NODE_ENV: "production",
  DATABASE_URL: perfUrl,
  BETTER_AUTH_URL: origin,
  NEXT_PUBLIC_APP_URL: origin,
  APP_URL: origin,
  HEALTH_CHECK_TOKEN: healthToken,
  LOG_LEVEL: "warn",
  // Redis database 1, so a perf worker never takes development jobs (and the reverse).
  REDIS_URL: redisDb1(process.env.REDIS_URL),
  QUEUE_REDIS_URL: redisDb1(process.env.QUEUE_REDIS_URL),
  ...pairs(args["server-env"]),
};
let web: ChildProcess | null = null;
if (!args["no-server"]) {
  // A server left over from another run would answer the readiness probe below, and k6 would measure it
  // instead of the one this run configured.
  const busy = await fetch(`${origin}/health/live`)
    .then(() => true)
    .catch(() => false);
  if (busy) {
    console.error(
      `port ${args.port} is already serving; stop that server first`
    );
    process.exit(2);
  }
  web = start(
    "web",
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--port", args.port],
    path.join(root, "apps/web"),
    serverEnv
  );
  if (args.worker) {
    start("worker", "pnpm", ["--filter", "@nitap/worker", "start"], root, {
      ...serverEnv,
      WORKER_HEALTH_PORT: "3199",
      // A production worker refuses to start without clamd (spec 16 SD-8); no scenario uploads a file, so the
      // address is never dialled.
      CLAMAV_URL: process.env.CLAMAV_URL ?? "tcp://127.0.0.1:3310",
    });
  }
  const deadline = Date.now() + 60_000;
  let ready = false;
  while (!ready && Date.now() < deadline) {
    ready = await fetch(`${origin}/health/ready`, {
      headers: { authorization: `Bearer ${healthToken}` },
    })
      .then((r) => r.ok)
      .catch(() => false);
    if (!ready) await sleep(500);
  }
  if (!ready) {
    await stopAll();
    throw new Error("web never became ready");
  }
}

// ---- Sampling (PD-7) ----------------------------------------------------------------------------------------
const db = new pg.Client({ connectionString: perfUrl });
await db.connect();
if (args["reset-spike"]) {
  await db.query("DELETE FROM event_registration WHERE event_id = $1", [
    fixture.spikeEvent.id,
  ]);
  await db.query("UPDATE event SET registered_count = 0 WHERE id = $1", [
    fixture.spikeEvent.id,
  ]);
  console.log(
    `spike event ${fixture.spikeEvent.id} reset (capacity ${fixture.spikeEvent.capacity})`
  );
}
await db.query("SELECT pg_stat_reset()").catch(() => {});

const HZ = 100; // USER_HZ on Linux
const procTree = (pid: number): number[] => {
  const all = [pid];
  try {
    for (const child of execFileSync("pgrep", ["-P", String(pid)])
      .toString()
      .trim()
      .split("\n")
      .filter(Boolean)) {
      all.push(...procTree(Number(child)));
    }
  } catch {
    // no children
  }
  return all;
};
function procUsage(pids: number[]) {
  let ticks = 0;
  let rssKb = 0;
  for (const pid of pids) {
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      ticks += Number(fields[11]) + Number(fields[12]); // utime + stime
      const status = readFileSync(`/proc/${pid}/status`, "utf8");
      rssKb += Number(/VmRSS:\s+(\d+)/.exec(status)?.[1] ?? 0);
    } catch {
      // process gone
    }
  }
  return { ticks, rssKb };
}

type Sample = {
  t: number;
  connections: Record<string, number>;
  lockWaits: number;
  webRssMb: number;
  tps?: number;
  webCpuPct?: number;
  cacheHitPct?: number;
};
type Counters = {
  t: number;
  xact: number;
  blksRead: number;
  blksHit: number;
  ticks: number;
};
const samples: Sample[] = [];
let previous: Counters | null = null;
let sampling = true;
const webPids = web?.pid ? procTree(web.pid) : [];
async function sampleOnce() {
  const t = Date.now();
  const [activity, stats, settings] = await Promise.all([
    db.query(
      "SELECT coalesce(state, 'background') AS state, count(*)::int AS n FROM pg_stat_activity WHERE datname = $1 GROUP BY 1",
      [dbName]
    ),
    db.query(
      "SELECT xact_commit::bigint, xact_rollback::bigint, tup_returned::bigint, tup_fetched::bigint, blks_read::bigint, blks_hit::bigint FROM pg_stat_database WHERE datname = $1",
      [dbName]
    ),
    db.query(
      "SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE datname = $1 AND wait_event_type = 'Lock'",
      [dbName]
    ),
  ]);
  const s = stats.rows[0];
  const usage = web ? procUsage(webPids) : { ticks: 0, rssKb: 0 };
  const current: Counters = {
    t,
    xact: Number(s.xact_commit) + Number(s.xact_rollback),
    blksRead: Number(s.blks_read),
    blksHit: Number(s.blks_hit),
    ticks: usage.ticks,
  };
  const sample: Sample = {
    t,
    connections: Object.fromEntries(
      activity.rows.map((r: { state: string; n: number }) => [r.state, r.n])
    ),
    lockWaits: settings.rows[0].waiting,
    webRssMb: Math.round(usage.rssKb / 1024),
  };
  if (previous) {
    const dt = (t - previous.t) / 1000;
    sample.tps = Math.round((current.xact - previous.xact) / dt);
    sample.webCpuPct = Math.round(
      ((current.ticks - previous.ticks) / HZ / dt) * 100
    );
    const reads = current.blksRead - previous.blksRead;
    const hits = current.blksHit - previous.blksHit;
    sample.cacheHitPct =
      reads + hits === 0
        ? 100
        : Math.round((hits / (reads + hits)) * 1000) / 10;
  }
  previous = current;
  samples.push(sample);
}
const containerSamples: { t: number; cpuPct: number; mem: string }[] = [];
async function sampleContainer() {
  while (sampling) {
    try {
      const out = execFileSync("docker", [
        "stats",
        "--no-stream",
        "--format",
        "{{json .}}",
        "alumini-postgres-1",
      ]).toString();
      const j = JSON.parse(out);
      containerSamples.push({
        t: Date.now(),
        cpuPct: parseFloat(j.CPUPerc),
        mem: j.MemUsage.split(" / ")[0],
      });
    } catch {
      // docker stats unavailable
    }
    await sleep(2000);
  }
}
const sampler = (async () => {
  while (sampling) {
    await sampleOnce().catch((e: unknown) =>
      console.error("sample failed:", e instanceof Error ? e.message : e)
    );
    await sleep(2000);
  }
})();
const containerSampler = sampleContainer();

// ---- k6 -------------------------------------------------------------------------------------------------------
const stamp = new Date().toISOString().slice(0, 10);
const runId = `${scenario}${args.label ? `-${args.label}` : ""}`;
const summaryPath = `/perf/.data/summary-${runId}.json`;
const env = {
  BASE_URL: origin,
  ...(args.smoke ? { RATE: "2", DURATION: "30s", RAMP: "5s" } : {}),
  ...(args.rate ? { RATE: args.rate } : {}),
  ...(args.duration ? { DURATION: args.duration } : {}),
  ...(args.ramp ? { RAMP: args.ramp } : {}),
  ...pairs(args.env),
};
const startedAt = new Date();
const k6 = spawn(
  "docker",
  [
    "run",
    "--rm",
    "--network",
    "host",
    "--user",
    `${process.getuid?.() ?? 0}:${process.getgid?.() ?? 0}`,
    "-v",
    `${path.join(root, "perf")}:/perf`,
    ...Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]),
    K6_IMAGE,
    "run",
    "--quiet",
    "--summary-export",
    summaryPath,
    `/perf/k6/${scenario}.js`,
  ],
  { stdio: "inherit" }
);
const k6Exit = await new Promise<number>((resolve) =>
  k6.once("exit", (code) => resolve(code ?? 1))
);
const finishedAt = new Date();
sampling = false;
await sampler;
await containerSampler;
await db.end();
await stopAll();

// ---- Result -----------------------------------------------------------------------------------------------------
type K6Metric = Record<string, number>;
let summary: { metrics: Record<string, K6Metric> } | null = null;
try {
  summary = JSON.parse(
    readFileSync(
      path.join(root, summaryPath.replace("/perf/", "perf/")),
      "utf8"
    )
  );
} catch {
  console.error("no k6 summary written");
}
const stat = (values: (number | undefined)[]) => {
  const v = values.filter((x): x is number => typeof x === "number");
  if (v.length === 0) return null;
  return {
    avg: Math.round(v.reduce((a, b) => a + b, 0) / v.length),
    max: Math.max(...v),
  };
};
const busy = samples.map(
  (s) =>
    (s.connections.active ?? 0) + (s.connections["idle in transaction"] ?? 0)
);
const server = {
  web: {
    cpuPct: stat(samples.map((s) => s.webCpuPct)),
    rssMb: stat(samples.map((s) => s.webRssMb)),
    rssStartMb: samples[0]?.webRssMb,
    rssEndMb: samples.at(-1)?.webRssMb,
  },
  postgres: {
    connectionsBusy: stat(busy),
    connectionsTotal: stat(
      samples.map((s) =>
        Object.values(s.connections).reduce((a, b) => a + b, 0)
      )
    ),
    tps: stat(samples.map((s) => s.tps)),
    cacheHitPct: stat(samples.map((s) => s.cacheHitPct)),
    lockWaits: stat(samples.map((s) => s.lockWaits)),
    containerCpuPct: stat(containerSamples.map((s) => s.cpuPct)),
  },
};
const metrics: Record<string, K6Metric> = summary
  ? Object.fromEntries(
      Object.entries(summary.metrics).filter(([name]) =>
        /^(http_req_duration|http_req_failed|http_reqs|iterations|dropped_iterations|vus_max|checks|registrations_|server_errors)/.test(
          name
        )
      )
    )
  : {};
const gitSha = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
  cwd: root,
})
  .toString()
  .trim();
const dirty =
  execFileSync("git", ["status", "--porcelain"], { cwd: root })
    .toString()
    .trim() !== "";
const result = {
  scenario,
  label: args.label ?? null,
  git: { sha: gitSha, dirty },
  startedAt: startedAt.toISOString(),
  finishedAt: finishedAt.toISOString(),
  k6: {
    image: K6_IMAGE,
    env: { ...env, BASE_URL: undefined },
    exitCode: k6Exit,
    thresholdsPassed: k6Exit === 0,
  },
  seed: fixture.options,
  environment: {
    note: "One workstation: k6, next start, worker and the database containers share it (Phase 15 PD-2).",
    cpu: os.cpus()[0]?.model,
    cores: os.cpus().length,
    memoryGb: Math.round(os.totalmem() / 2 ** 30),
    node: process.version,
    serverEnv: Object.fromEntries(Object.entries(pairs(args["server-env"]))),
  },
  metrics,
  server,
  samples,
  containerSamples,
};

const fmt = (m: K6Metric | undefined, key: string) =>
  m?.[key] === undefined ? "-" : Math.round(m[key]);
console.log(
  `\n${runId}: k6 exit ${k6Exit}${k6Exit === 0 ? " (budgets met)" : k6Exit === 99 ? " (a threshold broke)" : ""}`
);
for (const [name, m] of Object.entries(metrics)) {
  if (
    name.startsWith("http_req_duration") &&
    !name.includes("expected_response")
  ) {
    const reqs = metrics[name.replace("http_req_duration", "http_reqs")];
    const failed =
      metrics[name.replace("http_req_duration", "http_req_failed")];
    console.log(
      `  ${(name.replace("http_req_duration", "") || "(all)").padEnd(52)} p50 ${fmt(m, "med")} p95 ${fmt(m, "p(95)")} p99 ${fmt(m, "p(99)")} ms` +
        `  ${reqs ? `${reqs.count} req` : ""}  ${failed?.value !== undefined ? `err ${(failed.value * 100).toFixed(2)}%` : ""}`
    );
  }
}
console.log(
  `  server: web CPU avg/max ${server.web.cpuPct?.avg}/${server.web.cpuPct?.max}% · RSS ${server.web.rssStartMb}→${server.web.rssEndMb} MB · pg busy conns avg/max ${server.postgres.connectionsBusy?.avg}/${server.postgres.connectionsBusy?.max} · tps avg ${server.postgres.tps?.avg} · pg container CPU avg/max ${server.postgres.containerCpuPct?.avg}/${server.postgres.containerCpuPct?.max}%`
);

if (!args.smoke) {
  const dir = path.join(root, "docs/operations/perf/data", stamp);
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${runId}.json`);
  writeFileSync(file, JSON.stringify(result, null, 1) + "\n");
  console.log(`  → ${path.relative(root, file)}`);
}
process.exit(k6Exit);
