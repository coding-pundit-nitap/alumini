#!/usr/bin/env node
// Restore drill. Runs the production database and backup tooling against a TLS MinIO:
//
//   D  host loss: destroy Postgres mid-traffic, restore, reconcile migrations, boot and sign in (RPO, RTO).
//   C  point-in-time: rows deleted after a recorded moment come back.
//
//   pnpm --filter @nitap/web build
//   pnpm docker:up
//   node packages/scripts/drills/restore.ts [--users 10000] [--soak 420] [--record] [--summary f] [--keep]
//
// The backup is taken one release behind, so the restore must apply the newest migration. --soak
// should exceed archive_timeout (300 s). --record appends to
// packages/scripts/drills/reports/restore-tests.md.
import { execFileSync, spawn } from "node:child_process";
import type { ExecFileSyncOptions } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const root = path.resolve(import.meta.dirname, "../../..");
// One level below the root, so compose.yml's `../docker` build context still resolves.
const work = path.join(root, ".drill-restore");
const project = "alumini-drill";

const { values: args } = parseArgs({
  options: {
    users: { type: "string", default: "10000" },
    soak: { type: "string", default: "420" },
    "pg-port": { type: "string", default: "55432" },
    port: { type: "string", default: "3100" },
    record: { type: "boolean", default: false },
    summary: { type: "string" },
    keep: { type: "boolean", default: false },
  },
});

const results: { name: string; pass: boolean; detail?: string }[] = [];
const timings: { step: string; ms: number }[] = [];
const check = (name: string, pass: boolean, detail?: string) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}  ${detail ?? ""}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now();
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

const password = randomBytes(12).toString("hex");
const env = {
  ...process.env,
  COMPOSE_PROJECT_NAME: project,
  BACKUP_METRICS_DIR: path.join(work, "metrics"),
};

/**
 * Runs a command in the drill directory, output to the console. Throws on a
 * non-zero exit.
 */
function run(
  cmd: string,
  cmdArgs: string[],
  options: ExecFileSyncOptions = {}
) {
  execFileSync(cmd, cmdArgs, {
    cwd: work,
    env,
    stdio: ["pipe", "inherit", "inherit"],
    ...options,
  });
}
/** Same, returning stdout. */
function capture(
  cmd: string,
  cmdArgs: string[],
  options: ExecFileSyncOptions = {}
): string {
  return execFileSync(cmd, cmdArgs, {
    cwd: work,
    env,
    stdio: ["pipe", "pipe", "inherit"],
    ...options,
  }).toString();
}
async function timed(step: string, fn: () => unknown) {
  const start = now();
  await fn();
  const took = now() - start;
  timings.push({ step, ms: took });
  console.log(`---- ${step}: ${secs(took)}`);
  return took;
}
const backup = (...a: string[]) => run("./backup.sh", a);
const sql = (
  query: string,
  {
    db = "alumini",
    service = "postgres",
  }: { db?: string; service?: string } = {}
) =>
  capture("docker", [
    "compose",
    "exec",
    "-T",
    service,
    "psql",
    "-U",
    "alumini",
    "-d",
    db,
    "-XtAq",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    query,
  ]).trim();
const rowCounts = (service = "postgres") =>
  Object.fromEntries(
    sql(
      `SELECT c.relname || '=' || (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I', c.relname), false, true, '')))[1]::text
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') ORDER BY 1`,
      { service }
    )
      .split("\n")
      .map((line) => line.split("="))
  );

// ---------------------------------------------------------------------------------------------- setup
function prepare() {
  rmSync(work, { recursive: true, force: true });
  mkdirSync(path.join(work, "certs"), { recursive: true });
  mkdirSync(path.join(work, "metrics"));
  copyFileSync(
    path.join(root, "deploy/compose.yml"),
    path.join(work, "compose.yml")
  );
  copyFileSync(
    path.join(root, "deploy/backup.sh"),
    path.join(work, "backup.sh")
  );
  chmodSync(path.join(work, "backup.sh"), 0o755);

  // A private CA and a certificate for the stand-in repository: pgBackRest refuses plain HTTP to S3.
  const certs = path.join(work, "certs");
  const ssl = (a: string[]) =>
    execFileSync("openssl", a, { cwd: certs, stdio: "ignore" });
  ssl(
    ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2"].concat([
      "-subj",
      "/CN=drill-ca",
      "-keyout",
      "ca.key",
      "-out",
      "ca.crt",
    ])
  );
  ssl(
    ["req", "-newkey", "rsa:2048", "-nodes", "-subj", "/CN=repo-s3"].concat([
      "-keyout",
      "private.key",
      "-out",
      "repo.csr",
    ])
  );
  writeFileSync(path.join(certs, "san.ext"), "subjectAltName=DNS:repo-s3\n");
  ssl(
    [
      "x509",
      "-req",
      "-in",
      "repo.csr",
      "-CA",
      "ca.crt",
      "-CAkey",
      "ca.key",
    ].concat([
      "-CAcreateserial",
      "-days",
      "2",
      "-extfile",
      "san.ext",
      "-out",
      "public.crt",
    ])
  );
  // MinIO runs as a non-root user; these are throwaway keys.
  for (const file of readdirSync(certs))
    chmodSync(path.join(certs, file), 0o644);

  const repoKey = "drill-repo";
  const repoSecret = randomBytes(16).toString("hex");
  writeFileSync(
    path.join(work, ".env"),
    [
      `COMPOSE_PROJECT_NAME=${project}`,
      // Only migrate and postgres run here; compose needs every image reference to interpolate.
      "WEB_IMAGE=alumini-web:drill",
      "WORKER_IMAGE=alumini-worker:drill",
      "MIGRATE_IMAGE=alumini-migrate:drill",
      `POSTGRES_PASSWORD=${password}`,
      `APP_DB_PASSWORD=${randomBytes(12).toString("hex")}`,
      "MINIO_ROOT_USER=drill-storage",
      `MINIO_ROOT_PASSWORD=${randomBytes(16).toString("hex")}`,
      "BACKUP_S3_ENDPOINT=repo-s3",
      "BACKUP_S3_REGION=us-east-1",
      "BACKUP_S3_BUCKET=alumini-backups",
      `BACKUP_S3_KEY=${repoKey}`,
      `BACKUP_S3_KEY_SECRET=${repoSecret}`,
      "BACKUP_S3_URI_STYLE=path",
      `BACKUP_CIPHER_PASS=${randomBytes(36).toString("base64")}`,
      "",
    ].join("\n")
  );
  // compose.override.yml is picked up by every `docker compose` call in this directory, backup.sh's included.
  const ca = { PGBACKREST_REPO1_STORAGE_CA_FILE: "/certs/ca.crt" };
  const caMount = "./certs/ca.crt:/certs/ca.crt:ro";
  writeFileSync(
    path.join(work, "compose.override.yml"),
    JSON.stringify(
      {
        services: {
          "repo-s3": {
            image: "cgr.dev/chainguard/minio:latest",
            command: "server /data --address :443 --certs-dir /certs",
            environment: {
              MINIO_ROOT_USER: repoKey,
              MINIO_ROOT_PASSWORD: repoSecret,
            },
            volumes: ["./certs:/certs:ro", "repo-data:/data"],
          },
          "repo-init": {
            image: "cgr.dev/chainguard/minio:latest",
            profiles: ["drill"],
            environment: { SSL_CERT_FILE: "/certs/ca.crt" },
            volumes: [caMount],
            entrypoint: [
              "sh",
              "-c",
              `until mc alias set r https://repo-s3 ${repoKey} ${repoSecret} >/dev/null 2>&1; do sleep 1; done; mc mb --ignore-existing r/alumini-backups`,
            ],
          },
          postgres: {
            environment: ca,
            volumes: [caMount],
            ports: [`127.0.0.1:${args["pg-port"]}:5432`],
          },
          "postgres-restore": { environment: ca, volumes: [caMount] },
          "backup-tools": {
            environment: { SSL_CERT_FILE: "/certs/ca.crt" },
            volumes: [caMount],
          },
        },
        volumes: { "repo-data": {} },
      },
      null,
      2
    )
  );
}

function teardown() {
  if (!existsSync(work)) return;
  try {
    run("docker", [
      "compose",
      "--profile",
      "tools",
      "--profile",
      "drill",
      "down",
      "-v",
      "--remove-orphans",
    ]);
  } catch {
    // best effort
  }
  rmSync(work, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------------------------- the app
async function smokeTest(databaseUrl: string) {
  const port = Number(args.port);
  const origin = `http://localhost:${port}`;
  const token = "drill-health-token-0000000000";
  const server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--port", String(port)],
    {
      cwd: path.join(root, "apps/web"),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        HEALTH_CHECK_TOKEN: token,
        BETTER_AUTH_URL: origin,
        LOG_LEVEL: "warn",
      },
      stdio: ["ignore", "inherit", "inherit"],
    }
  );
  try {
    const deadline = now() + 90_000;
    let ready = null;
    while (now() < deadline) {
      ready = await fetch(`${origin}/health/ready`, {
        headers: { authorization: `Bearer ${token}` },
      }).catch(() => null);
      if (ready?.ok) break;
      await sleep(500);
    }
    check(
      "app ready on the restored database",
      !!ready?.ok,
      `${ready?.status ?? "no answer"}`
    );
    const signIn = await fetch(`${origin}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({
        email: process.env.DEV_COORDINATOR_EMAIL,
        password: process.env.DEV_COORDINATOR_PASSWORD,
      }),
    });
    check("sign in with a restored account", signIn.ok, String(signIn.status));
    const cookie = signIn.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const read = await fetch(`${origin}/api/v1/alumni?limit=5`, {
      headers: { cookie },
    });
    check(
      "authenticated read (GET /api/v1/alumni)",
      read.ok,
      String(read.status)
    );
  } finally {
    server.kill("SIGTERM");
    await new Promise((r) => server.once("exit", r));
  }
}

// ---------------------------------------------------------------------------------------------- the drill
for (const name of [
  "BETTER_AUTH_SECRET",
  "DEV_COORDINATOR_EMAIL",
  "DEV_COORDINATOR_PASSWORD",
]) {
  if (!process.env[name])
    throw new Error(`${name} is not set (set -a && . ./.env && set +a)`);
}
if (!existsSync(path.join(root, "apps/web/.next/BUILD_ID")))
  throw new Error("no production build: pnpm --filter @nitap/web build");

const started = new Date();
const hostUrl = (db: string) =>
  `postgresql://alumini:${password}@127.0.0.1:${args["pg-port"]}/${db}`;
let restorePoint = "";
let size = "n/a";
let rpoMs: number | null = null;
let rtoMs: number | null = null;
try {
  teardown();
  prepare();

  await timed("build images (postgres, migrate)", () => {
    run("docker", ["compose", "build", "postgres"]);
    run(
      "docker",
      [
        "build",
        "-q",
        "-f",
        "docker/web.Dockerfile",
        "--target",
        "migrate",
        "-t",
        "alumini-migrate:drill",
        ".",
      ],
      { cwd: root }
    );
  });

  run("docker", ["compose", "up", "-d", "--wait", "postgres"]);
  run("docker", ["compose", "up", "-d", "repo-s3"]);
  run("docker", ["compose", "--profile", "drill", "run", "--rm", "repo-init"]);

  // One release behind: every migration except the newest.
  await timed(
    "seed (previous migrations, base seed, accounts, perf volume)",
    () => {
      const all = readdirSync(
        path.join(root, "packages/database/prisma/migrations")
      );
      const migrations = all.filter((m) => /^\d/.test(m)).sort();
      const n1 = path.join(work, "migrations-n1");
      cpSync(path.join(root, "packages/database/prisma/migrations"), n1, {
        recursive: true,
      });
      const last = migrations.at(-1);
      if (!last) throw new Error("no migrations found");
      rmSync(path.join(n1, last), { recursive: true });
      writeFileSync(
        path.join(work, "prisma.config.n1.ts"),
        `export default ${JSON.stringify({
          schema: path.join(root, "packages/database/prisma/schema.prisma"),
          migrations: { path: n1 },
          datasource: { url: hostUrl("alumini") },
        })};\n`
      );
      const seedEnv = {
        ...env,
        DATABASE_URL: hostUrl("alumini"),
        NODE_ENV: "development",
      };
      run(
        "pnpm",
        [
          "--filter",
          "@nitap/database",
          "exec",
          "prisma",
          "migrate",
          "deploy",
          "--config",
          path.join(work, "prisma.config.n1.ts"),
        ],
        { cwd: root, env: seedEnv }
      );
      run("pnpm", ["--filter", "@nitap/database", "db:seed"], {
        cwd: root,
        env: seedEnv,
      });
      run("pnpm", ["--filter", "@nitap/web", "db:seed:admin"], {
        cwd: root,
        env: seedEnv,
      });
      if (Number(args.users) > 0) {
        run(
          "pnpm",
          [
            "perf:seed",
            "--",
            "--users",
            args.users,
            "--out",
            path.join(work, "fixture.json"),
          ],
          {
            cwd: root,
            env: { ...seedEnv, PERF_DATABASE_URL: hostUrl("alumini_perf") },
          }
        );
      }
      sql("CREATE DATABASE dr_probe");
      sql(
        "CREATE TABLE hb (id bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT clock_timestamp()); " +
          "CREATE TABLE ledger (id int PRIMARY KEY); INSERT INTO ledger SELECT generate_series(1, 100)",
        { db: "dr_probe" }
      );
    }
  );
  const newest = readdirSync(
    path.join(root, "packages/database/prisma/migrations")
  )
    .filter((m) => /^\d/.test(m))
    .sort()
    .at(-1);
  if (!newest) throw new Error("no migrations found");
  size = sql(
    "SELECT pg_size_pretty(sum(pg_database_size(datname))) FROM pg_database"
  );

  await timed("full backup (backup.sh init)", () => backup("init"));
  await timed("logical dump (backup.sh dump)", () => backup("dump"));
  const dumpList = capture("sh", [
    "-c",
    `docker compose run --rm --no-deps -T backup-tools 'last=$(mc ls "backup/$BACKUP_S3_BUCKET/dumps/weekly/" | tail -1) && mc cat "backup/$BACKUP_S3_BUCKET/dumps/weekly/\${last##* }"' |
     docker compose exec -T postgres sh -c 'openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass env:PGBACKREST_REPO1_CIPHER_PASS | pg_restore -l' | grep -c 'TABLE DATA'`,
  ]).trim();
  check(
    "logical dump decrypts and lists",
    Number(dumpList) > 0,
    `${dumpList} tables`
  );

  // Scenario C's moment: everything after it must be absent from a restore to it.
  await sleep(1500);
  restorePoint = sql("SELECT now()");
  await sleep(1500);
  sql("DELETE FROM ledger WHERE id > 50", { db: "dr_probe" });

  await timed("differential backup", () => backup("backup", "diff"));
  await timed("archive check (backup.sh check)", () => backup("check"));

  // Heartbeat: one committed row a second until the host is lost.
  run("docker", [
    "compose",
    "exec",
    "-d",
    "-T",
    "postgres",
    "sh",
    "-c",
    `while psql -U alumini -d dr_probe -Xqc 'INSERT INTO hb DEFAULT VALUES'; do sleep 1; done`,
  ]);
  const heartbeatFrom = now();
  console.log(`---- heartbeat running; host loss in ${args.soak} s`);
  await sleep(Number(args.soak) * 1000);

  // ------------------------------------------------------------------------------------ D: host loss
  const before = rowCounts();
  const epoch = "SELECT extract(epoch FROM max(at)) * 1000 FROM hb";
  const lastWritten = Number(sql(epoch, { db: "dr_probe" }));
  const lossAt = now();
  run("docker", ["compose", "kill", "postgres"]);
  run("docker", ["compose", "rm", "-f", "postgres"]);
  run("docker", ["volume", "rm", `${project}_postgres-data`]);
  console.log("---- host lost: postgres killed, its volume removed");

  await timed("D restore latest (backup.sh restore)", () => backup("restore"));
  // No heartbeat at all means none of its WAL reached the repository: everything since it started is lost.
  const restored = sql(epoch, { db: "dr_probe" });
  const lastRestored = restored ? Number(restored) : heartbeatFrom;
  rpoMs = lastWritten - lastRestored;
  const iso = (ms: number) => new Date(ms).toISOString();
  check(
    "D data loss within RPO (15 min)",
    rpoMs <= 15 * 60_000,
    `${secs(rpoMs)} (last write ${iso(lastWritten)}, restored to ${iso(lastRestored)})`
  );

  // backup.sh integrity fails on a NOT VALID or violated constraint, a failed migration, or pending ones.
  let integrityOutput = "";
  await timed(
    "D reconcile migrations + integrity (backup.sh integrity)",
    () => {
      integrityOutput = capture("./backup.sh", ["integrity"]);
      process.stdout.write(integrityOutput);
    }
  );
  check(
    "D newest migration applied on top of the restore",
    integrityOutput.includes(newest),
    newest
  );
  check(
    "D constraints valid, migration status up to date",
    /Database schema is up to date/.test(integrityOutput),
    "backup.sh integrity"
  );

  const after = rowCounts();
  const differing = Object.keys(before).filter(
    (t) => t !== "_prisma_migrations" && before[t] !== after[t]
  );
  check(
    "D row counts equal before and after the loss",
    differing.length === 0,
    differing.length
      ? differing.map((t) => `${t} ${before[t]}→${after[t]}`).join(", ")
      : `${Object.keys(before).length} tables`
  );

  await timed("D app boot + smoke test", () => smokeTest(hostUrl("alumini")));
  rtoMs = now() - lossAt;
  check("D recovery within RTO (2 h)", rtoMs <= 2 * 3600_000, secs(rtoMs));

  // ------------------------------------------------------------------------------------ C: point in time
  await timed("C restore-test to the recorded moment", () =>
    backup("restore-test", "--target", restorePoint, "--keep")
  );
  const ledger = sql("SELECT count(*) FROM ledger", {
    db: "dr_probe",
    service: "postgres-restore",
  });
  check(
    "C rows deleted after the target are back",
    ledger === "100",
    `${ledger} of 100`
  );
  const beats = sql(`SELECT count(*) FROM hb WHERE at > '${restorePoint}'`, {
    db: "dr_probe",
    service: "postgres-restore",
  });
  check("C nothing after the target", beats === "0", `${beats} later rows`);

  backup("verify");
  const metrics = readdirSync(path.join(work, "metrics")).sort();
  const expected = [
    "full",
    "dump",
    "diff",
    "check",
    "restore",
    "restore_test",
    "verify",
  ].map((k) => `alumini_backup_${k}.prom`);
  check(
    "success metrics exported for every job",
    expected.every((m) => metrics.includes(m)),
    metrics.join(" ")
  );

  console.log(`\ndatabase size ${size}`);
  for (const t of timings) console.log(`${t.step.padEnd(60)} ${secs(t.ms)}`);
  console.log(`RPO ${secs(rpoMs)}  RTO ${secs(rtoMs ?? 0)}`);
} catch (error) {
  check(
    "drill ran to completion",
    false,
    error instanceof Error ? error.message : String(error)
  );
} finally {
  if (args.keep)
    console.log(`kept: ${work} (docker compose project ${project})`);
  else teardown();
}
// Failed runs are recorded too (packages/scripts/drills/reports/restore-tests.md).
const failed = results.filter((r) => !r.pass);
const report = [
  "",
  `## ${started.toISOString().slice(0, 16).replace("T", " ")} UTC — drill (packages/scripts/drills/restore.ts) — ${failed.length ? "FAIL" : "PASS"}`,
  "",
  `Production configuration (deploy/compose.yml, deploy/backup.sh) on ${process.env.DRILL_HOST ?? "a developer machine"}; stand-in repository: TLS MinIO on the same host. Cluster ${size}, ${args.users} perf users; heartbeat soak ${args.soak} s.`,
  "",
  "| Step | Duration |",
  "| --- | --- |",
  ...timings.map((t) => `| ${t.step} | ${secs(t.ms)} |`),
  "",
  rpoMs === null
    ? "RPO and RTO not measured: the drill stopped before the restore."
    : `**Measured RPO ${secs(rpoMs)}; RTO ${rtoMs === null ? "not reached" : secs(rtoMs)}** (host loss to signed-in read on the restored database).`,
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
  appendFileSync(
    path.join(root, "packages/scripts/drills/reports/restore-tests.md"),
    report
  );
if (args.summary) appendFileSync(args.summary, report);
process.exit(failed.length === 0 ? 0 : 1);
