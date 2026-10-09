import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import pg from "pg";

/**
 * Fails when a new migration blocks writes to a populated table for longer than --max-hold-ms.
 * Builds the database at the merge base with --base, seeds it, then applies the new migrations while
 * sampling pg_locks every 20 ms.
 *
 *   node packages/scripts/check-migration-locks.ts [--base origin/main] [--users 10000] [--max-hold-ms 1000]
 *                                                  [--summary f] [--keep]
 *
 * Creates and drops `alumini_locks_perf` on DATABASE_URL's server, so it must be local.
 */
const root = path.resolve(import.meta.dirname, "../..");
const worktree = path.join(root, ".migration-locks");
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const WRITE_BLOCKING = [
  "ShareLock",
  "ShareRowExclusiveLock",
  "ExclusiveLock",
  "AccessExclusiveLock",
];
const SAMPLE_MS = 20;

const { values: args } = parseArgs({
  options: {
    base: { type: "string", default: "origin/main" },
    users: { type: "string", default: "10000" },
    "max-hold-ms": { type: "string", default: "1000" },
    summary: { type: "string" },
    keep: { type: "boolean", default: false },
  },
});
const maxHold = Number(args["max-hold-ms"]);

const git = (...a: string[]) =>
  execFileSync("git", a, { cwd: root, stdio: ["ignore", "pipe", "inherit"] })
    .toString()
    .trim();

const mergeBase = git("merge-base", "HEAD", args.base);
const added = [
  ...new Set(
    git(
      "diff",
      "--name-only",
      "--diff-filter=A",
      mergeBase,
      "HEAD",
      "--",
      "packages/database/prisma/migrations"
    )
      .split("\n")
      .map((file) => /migrations\/(\d{14}_[^/]+)\//.exec(file)?.[1])
      .filter((name): name is string => !!name)
  ),
].sort();
if (added.length === 0) {
  console.log(
    `No migrations added since ${mergeBase.slice(0, 12)}; nothing to measure.`
  );
  process.exit(0);
}
console.log(
  `Migrations added since ${mergeBase.slice(0, 12)}: ${added.join(", ")}`
);

const serverUrl = process.env.DATABASE_URL;
if (!serverUrl) throw new Error("DATABASE_URL is not set");
const url = new URL(serverUrl);
if (!LOCAL_HOSTS.has(url.hostname))
  throw new Error(
    `Refusing to create and drop a database on "${url.hostname}": run against a local server.`
  );
url.pathname = "/alumini_locks_perf";
const databaseUrl = url.toString();

type Hold = {
  table: string;
  mode: string;
  rows: number;
  first: number;
  last: number;
};
const holds = new Map<string, Hold>();
let failed = false;
const lines: string[] = [];
try {
  // ------------------------------------------------------------------------------ the base, populated
  rmSync(worktree, { recursive: true, force: true });
  git("worktree", "prune");
  git("worktree", "add", "--detach", "--force", worktree, mergeBase);
  const inBase = { cwd: worktree, stdio: "inherit" as const };
  execFileSync(
    "pnpm",
    ["install", "--frozen-lockfile", "--prefer-offline"],
    inBase
  );
  execFileSync(
    "pnpm",
    [
      "perf:seed",
      "--",
      "--users",
      args.users,
      "--reset",
      "--out",
      path.join(worktree, "fixture.json"),
    ],
    {
      ...inBase,
      env: {
        ...process.env,
        PERF_DATABASE_URL: databaseUrl,
        BETTER_AUTH_SECRET:
          process.env.BETTER_AUTH_SECRET ?? randomBytes(32).toString("hex"),
      },
    }
  );

  // ------------------------------------------------------------------------------ this tree's migrations
  const sampler = new pg.Client({ connectionString: databaseUrl });
  await sampler.connect();
  const tables = new Map(
    (
      await sampler.query<{ relname: string; rows: string }>(
        `SELECT c.relname, greatest(c.reltuples, 0)::bigint AS rows FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')`
      )
    ).rows.map((r) => [r.relname, Number(r.rows)])
  );
  let sampling = true;
  const sampling$ = (async () => {
    while (sampling) {
      const { rows } = await sampler.query<{
        pid: number;
        relname: string;
        mode: string;
        at: Date;
      }>(
        `SELECT l.pid, c.relname, l.mode, clock_timestamp() AS at FROM pg_locks l
         JOIN pg_class c ON c.oid = l.relation JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE l.granted AND n.nspname = 'public' AND l.pid <> pg_backend_pid() AND l.mode = ANY($1)`,
        [WRITE_BLOCKING]
      );
      for (const r of rows) {
        const rowCount = tables.get(r.relname);
        if (rowCount === undefined) continue; // created by the migration itself: nobody else uses it yet
        const key = `${r.pid}|${r.relname}|${r.mode}`;
        const at = r.at.getTime();
        const hold = holds.get(key);
        if (hold) hold.last = at;
        else
          holds.set(key, {
            table: r.relname,
            mode: r.mode,
            rows: rowCount,
            first: at,
            last: at,
          });
      }
      await new Promise((resolve) => setTimeout(resolve, SAMPLE_MS));
    }
  })();
  try {
    // Asynchronous: a synchronous child would block the event loop, and the sampler with it.
    const code = await new Promise<number>((resolve) =>
      spawn("pnpm", ["--filter", "@nitap/database", "db:deploy"], {
        cwd: root,
        stdio: "inherit",
        env: { ...process.env, DATABASE_URL: databaseUrl },
      }).once("exit", (c) => resolve(c ?? 1))
    );
    if (code !== 0) throw new Error(`prisma migrate deploy exited ${code}`);
  } finally {
    sampling = false;
    await sampling$;
  }
  const applied = (
    await sampler.query<{
      migration_name: string;
      started_at: Date;
      finished_at: Date;
    }>(
      "SELECT migration_name, started_at, finished_at FROM _prisma_migrations WHERE migration_name = ANY($1) ORDER BY 1",
      [added]
    )
  ).rows;
  await sampler.end();

  // ------------------------------------------------------------------------------ report
  lines.push(
    "",
    `### Migration locks on ${args.users} perf users (limit ${maxHold} ms)`,
    "",
    "| Migration | Duration | Write-blocking locks on existing tables |",
    "| --- | --- | --- |"
  );
  // Each hold belongs to the last migration that had started when it was first seen: migrations run one after
  // another on one connection, so windows only touch at their ends.
  const byStart = [...applied].sort(
    (a, b) => a.started_at.getTime() - b.started_at.getTime()
  );
  const owner = (h: Hold) =>
    byStart.findLast((m) => m.started_at.getTime() <= h.first)
      ?.migration_name ?? byStart[0]?.migration_name;
  for (const m of applied) {
    const from = m.started_at.getTime();
    const to = m.finished_at.getTime();
    const mine = [...holds.values()].filter(
      (h) => owner(h) === m.migration_name
    );
    const described = mine.map((h) => {
      const held = h.last - h.first + SAMPLE_MS;
      const over = held > maxHold;
      failed ||= over;
      return `${over ? "**" : ""}${h.table} (${h.rows} rows) ${h.mode} ${held} ms${over ? "**" : ""}`;
    });
    lines.push(
      `| ${m.migration_name} | ${to - from} ms | ${described.join("; ") || "none"} |`
    );
  }
  for (const name of added.filter(
    (n) => !applied.some((m) => m.migration_name === n)
  )) {
    failed = true;
    lines.push(`| ${name} | **not applied** | |`);
  }
  lines.push(
    "",
    failed
      ? `**FAIL**: a migration blocks writes for longer than ${maxHold} ms. Split it (expand → migrate → contract), use CONCURRENTLY, or add constraints NOT VALID and validate separately.`
      : "PASS",
    ""
  );
} finally {
  if (args.keep) console.log(`kept: ${worktree} and ${databaseUrl}`);
  else {
    if (existsSync(worktree)) git("worktree", "remove", "--force", worktree);
    const admin = new pg.Client({ connectionString: serverUrl });
    await admin.connect();
    await admin.query(
      'DROP DATABASE IF EXISTS "alumini_locks_perf" WITH (FORCE)'
    );
    await admin.end();
  }
}
const report = lines.join("\n");
console.log(report);
if (args.summary) appendFileSync(args.summary, report);
process.exit(failed ? 1 : 0);
