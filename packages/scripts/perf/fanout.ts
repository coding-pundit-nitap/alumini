#!/usr/bin/env node
// Notification fan-out throughput (TASK.md Phase 15 "Notifications"; Phase 15 overview). `event.cancelled` notifies
// every registrant one at a time (~8–10 round trips each) inside one job bounded by FANOUT_TIMEOUT_MS (120 s). This
// measures how many recipients a single job reaches per second, so "batch or chunk?" is answered by a number.
//
//   set -a && . ./.env && set +a
//   node packages/scripts/perf/fanout.ts --recipients 100,500,2000 [--label baseline]
//
// For each size it inserts a cancelled event with that many REGISTERED members and the outbox row the cancel
// use case would have written, then times the worker from that row to the last notification. The worker runs
// against alumini_perf on Redis database 1 (as packages/scripts/perf/run.ts does). Results go next to the k6 results.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

const root = path.resolve(import.meta.dirname, "../../..");
const pg = createRequire(path.join(root, "apps/web/package.json"))("pg");
const { values: args } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: {
    recipients: { type: "string", default: "100,500,2000" },
    label: { type: "string" },
    timeout: { type: "string", default: "600" },
  },
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const redisDb1 = (value: string | undefined) => {
  if (!value) throw new Error("REDIS_URL and QUEUE_REDIS_URL must be set");
  const url = new URL(value);
  url.pathname = "/1";
  return url.toString();
};
const perfUrl = (() => {
  if (process.env.PERF_DATABASE_URL) return process.env.PERF_DATABASE_URL;
  if (!process.env.DATABASE_URL)
    throw new Error("PERF_DATABASE_URL (or DATABASE_URL) is not set");
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = "/alumini_perf";
  return url.toString();
})();

const db = new pg.Client({ connectionString: perfUrl });
await db.connect();

const worker = spawn("pnpm", ["--filter", "@nitap/worker", "start"], {
  cwd: root,
  env: {
    ...process.env,
    NODE_ENV: "production",
    DATABASE_URL: perfUrl,
    REDIS_URL: redisDb1(process.env.REDIS_URL),
    QUEUE_REDIS_URL: redisDb1(process.env.QUEUE_REDIS_URL),
    WORKER_HEALTH_PORT: "3199",
    LOG_LEVEL: "warn",
    // Required in production (spec 16 SD-8); fan-out never scans, so the address is never dialled.
    CLAMAV_URL: process.env.CLAMAV_URL ?? "tcp://127.0.0.1:3310",
  },
  stdio: ["ignore", "inherit", "inherit"],
  detached: true,
});
const stopWorker = () => {
  try {
    if (worker.pid) process.kill(-worker.pid, "SIGTERM");
  } catch {
    // already gone
  }
};
process.on("SIGINT", () => {
  stopWorker();
  process.exit(130);
});

let ready = false;
for (let i = 0; i < 120 && !ready; i += 1) {
  ready = await fetch("http://localhost:3199/health/ready")
    .then((r) => r.ok)
    .catch(() => false);
  if (!ready) await sleep(500);
}
if (!ready) {
  stopWorker();
  throw new Error("worker never became ready");
}

const {
  rows: [organizer],
} = await db.query(
  `SELECT u.id FROM "user" u JOIN user_role ur ON ur.user_id = u.id JOIN role r ON r.id = ur.role_id
   WHERE r.name = 'ALUMNI_COORDINATOR' ORDER BY u.email LIMIT 1`
);

const results = [];
for (const size of args.recipients.split(",").map(Number)) {
  const eventId = randomUUID();
  await db.query("BEGIN");
  await db.query(
    `INSERT INTO event (id, organizer_id, title, description, starts_at, timezone, location, is_online, capacity,
       registered_count, registration_deadline, status, cancelled_at, created_at, updated_at)
     VALUES ($1, $2, $3, 'Fan-out measurement event.', now() + interval '20 days', 'Asia/Kolkata', NULL, true, $4,
       $4, now() + interval '19 days', 'CANCELLED', now(), now(), now())`,
    [eventId, organizer.id, `Fan-out ${size}`, size]
  );
  await db.query(
    `INSERT INTO event_registration (id, event_id, user_id, state, registered_at, updated_at)
     SELECT gen_random_uuid(), $1::uuid, u.id, 'REGISTERED', now(), now()
     FROM "user" u WHERE u.account_state = 'VERIFIED' AND u.id <> $2 AND u.email LIKE 'perf.%'
     ORDER BY md5(u.id::text || $1::text) LIMIT $3`,
    [eventId, organizer.id, size]
  );
  const t0 = Date.now();
  await db.query(
    `INSERT INTO outbox_event (type, payload, request_id) VALUES ('event.cancelled', $1, $2)`,
    [
      JSON.stringify({ v: 1, eventId, actorId: organizer.id }),
      `perf-fanout-${size}`,
    ]
  );
  await db.query("COMMIT");

  let first = null;
  let done = 0;
  const deadline = t0 + Number(args.timeout) * 1000;
  const progress = [];
  while (Date.now() < deadline) {
    const {
      rows: [{ n }],
    } = await db.query(
      `SELECT count(*)::int AS n FROM notification WHERE type = 'event.cancelled' AND payload->>'eventId' = $1`,
      [eventId]
    );
    done = n;
    if (n > 0 && first === null) first = Date.now() - t0;
    progress.push({ ms: Date.now() - t0, delivered: n });
    if (n >= size) break;
    await sleep(500);
  }
  const totalMs = Date.now() - t0;
  const fanoutMs = first === null ? null : totalMs - first;
  const result = {
    recipients: size,
    delivered: done,
    complete: done >= size,
    msToFirst: first,
    msToAll: done >= size ? totalMs : null,
    recipientsPerSecond: fanoutMs
      ? Math.round((done / fanoutMs) * 1000 * 10) / 10
      : null,
    progress,
  };
  results.push(result);
  console.log(
    `${size} recipients: ${done} delivered, first after ${first} ms, ` +
      `${result.complete ? `all after ${(totalMs / 1000).toFixed(1)} s` : "INCOMPLETE"}, ~${result.recipientsPerSecond}/s`
  );
}

stopWorker();
await db.end();

const stamp = new Date().toISOString().slice(0, 10);
const dir = path.join(root, "docs/operations/perf/data", stamp);
mkdirSync(dir, { recursive: true });
const file = path.join(dir, `fanout${args.label ? `-${args.label}` : ""}.json`);
writeFileSync(
  file,
  JSON.stringify(
    {
      scenario: "fanout",
      label: args.label ?? null,
      startedAt: new Date().toISOString(),
      environment: {
        cpu: os.cpus()[0]?.model,
        cores: os.cpus().length,
        node: process.version,
      },
      results,
    },
    null,
    1
  ) + "\n"
);
console.log(`→ ${path.relative(root, file)}`);
process.exit(0);
