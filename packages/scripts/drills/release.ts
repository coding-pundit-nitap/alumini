#!/usr/bin/env node
// Release drill (Phase 18B; reliability §8.3–§8.5, §9.3; spec 18 PRD-2, PRD-5). Runs the production release
// tooling (deploy/compose.yml, deploy/deploy.sh) for real, in two throwaway clones of a local git origin, with a
// local registry standing in for CI's:
//
//   staging     deploy.sh pull N, pull N+1                     (digests pinned, smoke tested)
//   production  promote N, promote N+1, rollback N, promote N+1  (staging's digests only)
//
// N+1 carries an expand migration (a nullable column, then a CONCURRENTLY index), so the rollback runs the old
// release on the new schema, which is the claim that makes rollback safe (§9.3). The interruption of each
// production release is measured from outside by polling /health/live, which decides PRD-2 (blue/green
// becomes a launch gate above 30 s).
//
//   node packages/scripts/drills/release.ts [--skip-build] [--record] [--summary f] [--keep]
//
// --skip-build uses existing nitap-{web,worker,migrate,postgres}:drill images (CI builds them with its layer
// cache). Stand-ins, not under test: the registry; Mailpit for SMTP; a no-op for clamd, which the worker needs
// only when a scan runs; archiving off, because the restore drill covers backups. --record appends the result to
// docs/operations/release-drills.md, --summary <file> to another file (CI's step summary). Exit code 1 if any
// check fails.
import { execFileSync, spawn } from "node:child_process";
import type { ExecFileSyncOptions } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const root = path.resolve(import.meta.dirname, "../../..");
const work = path.join(root, ".drill-release");
const registryName = "alumini-drill-registry";
const images = ["web", "worker", "migrate", "postgres"] as const;

const { values: args } = parseArgs({
  options: {
    "registry-port": { type: "string", default: "55000" },
    "staging-port": { type: "string", default: "3201" },
    "production-port": { type: "string", default: "3200" },
    "skip-build": { type: "boolean", default: false },
    record: { type: "boolean", default: false },
    summary: { type: "string" },
    keep: { type: "boolean", default: false },
  },
});
const registry = `localhost:${args["registry-port"]}`;

const results: { name: string; pass: boolean; detail?: string }[] = [];
const timings: { step: string; ms: number }[] = [];
const check = (name: string, pass: boolean, detail?: string) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}  ${detail ?? ""}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now();
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

function run(
  cmd: string,
  cmdArgs: string[],
  options: ExecFileSyncOptions = {}
) {
  execFileSync(cmd, cmdArgs, {
    cwd: work,
    stdio: ["ignore", "inherit", "inherit"],
    ...options,
  });
}
function capture(
  cmd: string,
  cmdArgs: string[],
  options: ExecFileSyncOptions = {}
): string {
  return execFileSync(cmd, cmdArgs, {
    cwd: work,
    stdio: ["ignore", "pipe", "inherit"],
    ...options,
  })
    .toString()
    .trim();
}
const git = (cwd: string, ...a: string[]) =>
  capture(
    "git",
    ["-c", "user.name=drill", "-c", "user.email=drill@example.org", ...a],
    { cwd }
  );

// ---------------------------------------------------------------------------------------------- environments
type Env = {
  name: "staging" | "production";
  clone: string;
  deploy: string;
  port: string;
  project: string;
};
const environments: Record<Env["name"], Env> = Object.fromEntries(
  (["staging", "production"] as const).map((name) => {
    const clone = path.join(work, name);
    return [
      name,
      {
        name,
        clone,
        deploy: path.join(clone, "deploy"),
        port: args[`${name}-port`],
        project: `alumini-drill-${name}`,
      },
    ];
  })
) as Record<Env["name"], Env>;
const smoke = {
  email: "drill-smoke@example.org",
  password: randomBytes(12).toString("hex"),
};

function writeEnv(env: Env) {
  const origin = `http://127.0.0.1:${env.port}`;
  writeFileSync(
    path.join(env.deploy, ".env"),
    [
      `DEPLOY_ENV=${env.name}`,
      `COMPOSE_PROJECT_NAME=${env.project}`,
      `WEB_PORT=${env.port}`,
      `IMAGE_REGISTRY=${registry}`,
      `STAGING_RELEASES=${path.join(environments.staging.deploy, "releases.log")}`,
      "RELEASE_SHA=",
      "WEB_IMAGE=",
      "WORKER_IMAGE=",
      "MIGRATE_IMAGE=",
      "POSTGRES_IMAGE=",
      `POSTGRES_PASSWORD=${randomBytes(12).toString("hex")}`,
      "MINIO_ROOT_USER=drill-storage",
      `MINIO_ROOT_PASSWORD=${randomBytes(16).toString("hex")}`,
      // Required by compose; unused, because archiving is off in this drill.
      "BACKUP_S3_ENDPOINT=repo.invalid",
      "BACKUP_S3_REGION=us-east-1",
      "BACKUP_S3_BUCKET=unused",
      "BACKUP_S3_KEY=unused",
      "BACKUP_S3_KEY_SECRET=unused",
      `BACKUP_CIPHER_PASS=${randomBytes(24).toString("hex")}`,
      `NEXT_PUBLIC_APP_URL=${origin}`,
      `BETTER_AUTH_URL=${origin}`,
      `APP_URL=${origin}`,
      `BETTER_AUTH_SECRET=${randomBytes(32).toString("hex")}`,
      `HEALTH_CHECK_TOKEN=${randomBytes(16).toString("hex")}`,
      "SMTP_URL=smtp://mailpit:1025",
      "EMAIL_FROM=drill@example.org",
      `SMOKE_EMAIL=${smoke.email}`,
      `SMOKE_PASSWORD=${smoke.password}`,
      "LOG_LEVEL=warn",
      "",
    ].join("\n")
  );
  // Untracked, so deploy.sh's clean-clone check ignores it; every `docker compose` in deploy/ picks it up.
  writeFileSync(
    path.join(env.deploy, "compose.override.yml"),
    JSON.stringify(
      {
        services: {
          postgres: { command: ["postgres", "-c", "archive_mode=off"] },
          clamav: {
            image: "alpine:3.22",
            command: ["sleep", "infinity"],
            healthcheck: { disable: true },
          },
          mailpit: { image: "axllent/mailpit:v1.27" },
        },
      },
      null,
      2
    )
  );
}

const compose = (env: Env, ...a: string[]) =>
  run("docker", ["compose", ...a], { cwd: env.deploy });
const sql = (env: Env, query: string) =>
  capture(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "alumini",
      "-d",
      "alumini",
      "-XtAq",
      "-c",
      query,
    ],
    { cwd: env.deploy }
  );
const logLines = (env: Env) => {
  const file = path.join(env.deploy, "releases.log");
  return existsSync(file) ? readFileSync(file, "utf8").trim().split("\n") : [];
};
const field = (line: string, key: string) =>
  new RegExp(` ${key}=(\\S+)`).exec(line)?.[1] ?? "";
const runningImage = (env: Env, service: string) =>
  capture(
    "docker",
    [
      "inspect",
      "--format",
      "{{.Config.Image}}",
      capture("docker", ["compose", "ps", "-q", service], { cwd: env.deploy }),
    ],
    { cwd: env.deploy }
  );

/** Runs deploy.sh while polling /health/live every 100 ms; returns the longest unanswered stretch. */
async function measured(env: Env, ...a: string[]) {
  const url = `http://127.0.0.1:${env.port}/health/live`;
  let polling = true;
  let downSince: number | null = null;
  let longest = 0;
  const poller = (async () => {
    while (polling) {
      const ok = await fetch(url, { signal: AbortSignal.timeout(1000) })
        .then((r) => r.ok)
        .catch(() => false);
      const t = now();
      if (!ok && downSince === null) downSince = t;
      if (ok && downSince !== null) {
        longest = Math.max(longest, t - downSince);
        downSince = null;
      }
      await sleep(100);
    }
  })();
  const started = now();
  const code = await new Promise<number>((resolve) => {
    spawn("./deploy.sh", a, {
      cwd: env.deploy,
      stdio: ["ignore", "inherit", "inherit"],
    }).once("exit", (c) => resolve(c ?? 1));
  });
  const took = now() - started;
  polling = false;
  await poller;
  if (downSince !== null) longest = Math.max(longest, now() - downSince);
  timings.push({ step: `${env.name}: deploy.sh ${a.join(" ")}`, ms: took });
  console.log(
    `---- ${env.name}: deploy.sh ${a.join(" ")}: ${secs(took)}, longest interruption ${secs(longest)}`
  );
  return { code, took, longest };
}

// ---------------------------------------------------------------------------------------------- setup
function buildImages() {
  const build = (
    file: string,
    tag: string,
    extra: string[] = [],
    context = root
  ) =>
    run(
      "docker",
      [
        "build",
        "-q",
        "-f",
        file,
        "--build-arg",
        "GIT_SHA=drill",
        ...extra,
        "-t",
        tag,
        context,
      ],
      {
        cwd: root,
      }
    );
  build("docker/web.Dockerfile", "nitap-web:drill");
  build("docker/web.Dockerfile", "nitap-migrate:drill", [
    "--target",
    "migrate",
  ]);
  build("docker/worker.Dockerfile", "nitap-worker:drill");
  build(
    "docker/postgres.Dockerfile",
    "nitap-postgres:drill",
    [],
    path.join(root, "docker")
  );
}

/** N+1: the same app with a distinct digest, and a migrate image carrying two expand migrations. */
function deriveNext(): string[] {
  const newest = readdirSync(
    path.join(root, "packages/database/prisma/migrations")
  )
    .filter((m) => /^\d{14}_/.test(m))
    .sort()
    .at(-1);
  if (!newest) throw new Error("no migrations found");
  // Later than every real migration, whatever the clock says.
  const stamp = String(
    Math.max(
      Number(newest.slice(0, 14)) + 1,
      Number(new Date().toISOString().replace(/\D/g, "").slice(0, 14))
    )
  );
  const column = `${stamp}_drill_expand_column`;
  const index = `${Number(stamp) + 1}_drill_expand_index`;
  const next = path.join(work, "next");
  const migrations = path.join(next, "migrations");
  mkdirSync(path.join(migrations, column), { recursive: true });
  mkdirSync(path.join(migrations, index), { recursive: true });
  writeFileSync(
    path.join(migrations, column, "migration.sql"),
    'ALTER TABLE "user" ADD COLUMN "drill_note" TEXT;\n'
  );
  // Alone in its file: CONCURRENTLY cannot run inside the transaction a multi-statement script implies.
  writeFileSync(
    path.join(migrations, index, "migration.sql"),
    'CREATE INDEX CONCURRENTLY "ix_user_drill_note" ON "user" ("drill_note");\n'
  );
  for (const name of ["web", "worker"])
    writeFileSync(
      path.join(next, `${name}.Dockerfile`),
      `FROM nitap-${name}:drill\nLABEL drill.release=next\n`
    );
  writeFileSync(
    path.join(next, "migrate.Dockerfile"),
    "FROM nitap-migrate:drill\nCOPY migrations/ /repo/packages/database/prisma/migrations/\n"
  );
  for (const name of ["web", "worker", "migrate"])
    run(
      "docker",
      [
        "build",
        "-q",
        "-f",
        `${name}.Dockerfile`,
        "-t",
        `nitap-${name}:drill-next`,
        ".",
      ],
      { cwd: next }
    );
  return [column, index];
}

function publish(sha: string, suffix: "" | "-next") {
  for (const name of images) {
    const source =
      name === "postgres"
        ? "nitap-postgres:drill"
        : `nitap-${name}:drill${suffix}`;
    const target = `${registry}/nitap-${name}:${sha}`;
    run("docker", ["tag", source, target]);
    run("docker", ["push", "-q", target]);
  }
}

function teardown() {
  for (const env of Object.values(environments)) {
    if (!existsSync(path.join(env.deploy, ".env"))) continue;
    try {
      compose(env, "--profile", "tools", "down", "-v", "--remove-orphans");
    } catch {
      // best effort
    }
  }
  try {
    execFileSync("docker", ["rm", "-f", registryName], { stdio: "ignore" });
  } catch {
    // not running
  }
  rmSync(work, { recursive: true, force: true });
}

/** Before the first release: schema and the smoke account, as README steps 6–7 do on a new server. */
function bootstrap(env: Env, sha: string) {
  const refs = images.map((name) => `${registry}/nitap-${name}:${sha}`);
  const envFile = path.join(env.deploy, ".env");
  let text = readFileSync(envFile, "utf8");
  images.forEach((name, i) => {
    text = text.replace(
      new RegExp(`^${name.toUpperCase()}_IMAGE=.*$`, "m"),
      `${name.toUpperCase()}_IMAGE=${refs[i]}`
    );
  });
  writeFileSync(envFile, text);
  compose(env, "run", "--rm", "migrate");
  compose(
    env,
    "run",
    "--rm",
    "-e",
    `BOOTSTRAP_ADMIN_EMAIL=${smoke.email}`,
    "-e",
    `BOOTSTRAP_ADMIN_PASSWORD=${smoke.password}`,
    "migrate",
    "pnpm",
    "--filter",
    "@nitap/web",
    "admin:bootstrap"
  );
}

// ---------------------------------------------------------------------------------------------- the drill
const started = new Date();
const interruptions: { step: string; ms: number }[] = [];
let migrationMs: number | null = null;
try {
  teardown();
  mkdirSync(work, { recursive: true });

  if (!args["skip-build"]) {
    const took = now();
    buildImages();
    timings.push({ step: "build images", ms: now() - took });
  }
  run("docker", [
    "run",
    "-d",
    "--name",
    registryName,
    "-p",
    `127.0.0.1:${args["registry-port"]}:5000`,
    "registry:3",
  ]);
  const drillMigrations = deriveNext();

  // A local origin with two commits; each server is a clone of it, as on a real host.
  const origin = path.join(work, "origin.git");
  const seed = path.join(work, "seed");
  run("git", ["init", "-q", "--bare", "-b", "main", origin]);
  run("git", ["clone", "-q", origin, seed]);
  mkdirSync(path.join(seed, "deploy"));
  mkdirSync(path.join(seed, "docker"));
  for (const file of ["compose.yml", "deploy.sh", ".env.example"])
    copyFileSync(
      path.join(root, "deploy", file),
      path.join(seed, "deploy", file)
    );
  chmodSync(path.join(seed, "deploy/deploy.sh"), 0o755);
  copyFileSync(
    path.join(root, "docker/postgres.Dockerfile"),
    path.join(seed, "docker/postgres.Dockerfile")
  );
  git(seed, "add", "-A");
  git(seed, "commit", "-qm", "release N");
  git(seed, "push", "-q", "origin", "main");
  const shaN = git(seed, "rev-parse", "HEAD");
  publish(shaN, "");

  for (const env of Object.values(environments)) {
    run("git", ["clone", "-q", origin, env.clone]);
    writeEnv(env);
  }
  const staging = environments.staging;
  const production = environments.production;

  // ------------------------------------------------------------------------------------ staging
  bootstrap(staging, shaN);
  let step = await measured(staging, "pull");
  let line = logLines(staging).at(-1) ?? "";
  check(
    "staging pull N: released, digests pinned, smoke passed",
    step.code === 0 &&
      field(line, "sha") === shaN &&
      field(line, "smoke") === "pass" &&
      images.every((n) => field(line, n).includes("@sha256:")),
    line.slice(0, 80)
  );

  writeFileSync(path.join(seed, "deploy/.release"), "N+1\n");
  git(seed, "add", "-A");
  git(seed, "commit", "-qm", "release N+1");
  git(seed, "push", "-q", "origin", "main");
  const shaN1 = git(seed, "rev-parse", "HEAD");
  publish(shaN1, "-next");

  step = await measured(staging, "pull");
  line = logLines(staging).at(-1) ?? "";
  check(
    "staging pull N+1: migrations applied, smoke passed",
    step.code === 0 &&
      field(line, "sha") === shaN1 &&
      field(line, "smoke") === "pass" &&
      sql(
        staging,
        `SELECT count(*) FROM _prisma_migrations WHERE migration_name LIKE '%_drill_expand_%' AND finished_at IS NOT NULL`
      ) === "2",
    `${field(line, "sha").slice(0, 12)} smoke=${field(line, "smoke")}`
  );
  const stagedN = logLines(staging).find((l) => field(l, "sha") === shaN) ?? "";
  const stagedN1 = line;
  // One stack at a time on the drill host; staging's releases.log stays for promote.
  compose(staging, "down", "-v", "--remove-orphans");

  // ------------------------------------------------------------------------------------ production
  let refused = await measured(production, "pull");
  check("production refuses pull", refused.code !== 0, `exit ${refused.code}`);
  refused = await measured(production, "promote", "0000000", "drill");
  check(
    "production refuses a SHA staging never passed",
    refused.code !== 0,
    `exit ${refused.code}`
  );

  bootstrap(production, shaN);
  step = await measured(
    production,
    "promote",
    shaN.slice(0, 10),
    "Drill Approver"
  );
  line = logLines(production).at(-1) ?? "";
  check(
    "promote N: staging's digests, approver recorded, smoke passed",
    step.code === 0 &&
      images.every((n) => field(line, n) === field(stagedN, n)) &&
      field(line, "by") === "Drill_Approver" &&
      field(line, "smoke") === "pass",
    `web ${field(line, "web").split("@")[1]?.slice(0, 19)}`
  );
  check(
    "live web image is N's digest",
    runningImage(production, "web") === field(stagedN, "web"),
    runningImage(production, "web")
  );

  step = await measured(production, "promote", shaN1, "Drill Approver");
  interruptions.push({
    step: "promote N → N+1 (with migrations)",
    ms: step.longest,
  });
  line = logLines(production).at(-1) ?? "";
  check(
    "promote N+1: staging's digests, smoke passed",
    step.code === 0 &&
      images.every((n) => field(line, n) === field(stagedN1, n)) &&
      field(line, "smoke") === "pass",
    `smoke=${field(line, "smoke")}`
  );
  migrationMs = Number(
    sql(
      production,
      `SELECT round(extract(epoch FROM max(finished_at) - min(started_at)) * 1000) FROM _prisma_migrations WHERE migration_name = ANY(ARRAY['${drillMigrations.join("','")}'])`
    )
  );
  check(
    "expand migrations applied by the release",
    Number.isFinite(migrationMs) && migrationMs >= 0,
    `${migrationMs} ms`
  );

  step = await measured(production, "rollback", shaN.slice(0, 10));
  interruptions.push({ step: "rollback N+1 → N", ms: step.longest });
  line = logLines(production).at(-1) ?? "";
  check(
    "rollback N: old release passes smoke on the new schema",
    step.code === 0 &&
      field(line, "source") === "rollback" &&
      field(line, "smoke") === "pass" &&
      sql(
        production,
        `SELECT count(*) FROM information_schema.columns WHERE table_name = 'user' AND column_name = 'drill_note'`
      ) === "1",
    `smoke=${field(line, "smoke")}, schema kept`
  );
  check(
    "live web image is N's digest again",
    runningImage(production, "web") === field(stagedN, "web")
  );

  refused = await measured(production, "promote", shaN, "drill");
  check(
    "promote of an older SHA is refused (rollback's job)",
    refused.code !== 0,
    `exit ${refused.code}`
  );

  step = await measured(production, "promote", shaN1, "Drill Approver");
  interruptions.push({ step: "promote N → N+1 again", ms: step.longest });
  line = logLines(production).at(-1) ?? "";
  check(
    "release N+1 again after the rollback",
    step.code === 0 &&
      field(line, "smoke") === "pass" &&
      runningImage(production, "web") === field(stagedN1, "web"),
    `smoke=${field(line, "smoke")}`
  );
  check(
    "worker running on N+1",
    runningImage(production, "worker") === field(stagedN1, "worker") &&
      capture("docker", ["compose", "ps", "--format", "{{.State}}", "worker"], {
        cwd: production.deploy,
      }) === "running"
  );

  const worst = Math.max(...interruptions.map((i) => i.ms));
  check(
    "longest interruption within 30 s (else blue/green is a launch gate, PRD-2)",
    worst <= 30_000,
    secs(worst)
  );

  for (const t of timings) console.log(`${t.step.padEnd(60)} ${secs(t.ms)}`);
  for (const i of interruptions)
    console.log(`interruption  ${i.step.padEnd(46)} ${secs(i.ms)}`);
} catch (error) {
  check(
    "drill ran to completion",
    false,
    error instanceof Error ? error.message : String(error)
  );
} finally {
  if (args.keep) console.log(`kept: ${work}`);
  else teardown();
}

const failed = results.filter((r) => !r.pass);
const report = [
  "",
  `## ${started.toISOString().slice(0, 16).replace("T", " ")} UTC — drill (packages/scripts/drills/release.ts) — ${failed.length ? "FAIL" : "PASS"}`,
  "",
  `Production release tooling (deploy/compose.yml, deploy/deploy.sh) on ${process.env.DRILL_HOST ?? "a developer machine"}; staging and production clones of a local origin, local registry. N+1 adds two expand migrations (nullable column, CONCURRENTLY index).`,
  "",
  "| Step | Duration |",
  "| --- | --- |",
  ...timings.map((t) => `| ${t.step} | ${secs(t.ms)} |`),
  "",
  "| Production release | Longest /health/live interruption |",
  "| --- | --- |",
  ...interruptions.map((i) => `| ${i.step} | ${secs(i.ms)} |`),
  "",
  migrationMs === null
    ? ""
    : `Expand migrations took ${migrationMs} ms (the release's migrate step, from \`_prisma_migrations\`).`,
  "",
  "| Check | Result | Detail |",
  "| --- | --- | --- |",
  ...results.map(
    (r) =>
      `| ${r.name} | ${r.pass ? "pass" : "**FAIL**"} | ${String(r.detail ?? "").replaceAll("|", "\\|")} |`
  ),
  "",
].join("\n");
if (args.record)
  appendFileSync(path.join(root, "docs/operations/release-drills.md"), report);
if (args.summary) appendFileSync(args.summary, report);
process.exit(failed.length === 0 ? 0 : 1);
