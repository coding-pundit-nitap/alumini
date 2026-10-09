import { spawnSync } from "node:child_process";
import path from "node:path";

import pg from "pg";

/**
 * Fails when the migrations and schema.prisma describe different databases:
 * replays every migration into a shadow database and diffs it against the
 * schema.
 *
 * The shadow database is SHADOW_DATABASE_URL, or `<db>_shadow` on a local
 * DATABASE_URL host. `--skip-unreachable` passes with a warning when Postgres
 * isn't running.
 */
const root = path.resolve(import.meta.dirname, "../..");
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const skipUnreachable = process.argv.includes("--skip-unreachable");

const databaseUrl = process.env.DATABASE_URL;
if (!process.env.SHADOW_DATABASE_URL && !databaseUrl) {
  console.error(
    "db:drift needs DATABASE_URL (or SHADOW_DATABASE_URL). Run `pnpm docker:up` and copy .env.example to .env."
  );
  process.exit(1);
}

let shadowUrl = process.env.SHADOW_DATABASE_URL;
if (!shadowUrl) {
  const url = new URL(databaseUrl!);
  if (!LOCAL_HOSTS.has(url.hostname)) {
    console.error(
      `Refusing to derive a shadow database on "${url.hostname}": Prisma wipes it. Set SHADOW_DATABASE_URL.`
    );
    process.exit(1);
  }
  const name = `${url.pathname.slice(1)}_shadow`;
  url.pathname = `/${name}`;
  shadowUrl = url.toString();

  const admin = new URL(databaseUrl!);
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.toString() });
  try {
    await client.connect();
  } catch (error) {
    if (!skipUnreachable) throw error;
    console.warn(
      "migration drift check skipped: Postgres is not reachable (start it with `pnpm docker:up`; CI still checks)"
    );
    process.exit(0);
  }
  try {
    const { rowCount } = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [name]
    );
    if (!rowCount) await client.query(`CREATE DATABASE "${name}"`);
  } finally {
    await client.end();
  }
}

const result = spawnSync(
  "pnpm",
  [
    "exec",
    "prisma",
    "migrate",
    "diff",
    "--from-migrations",
    "prisma/migrations",
    "--to-schema",
    "prisma/schema.prisma",
    "--script",
    "--exit-code",
  ],
  {
    // From the package itself: `pnpm --filter … exec` reports every failure as exit 1, hiding
    // --exit-code's 2 (drift).
    cwd: path.join(root, "packages/database"),
    env: { ...process.env, SHADOW_DATABASE_URL: shadowUrl },
    stdio: ["ignore", "pipe", "inherit"],
    encoding: "utf8",
  }
);

if (result.status === 0) {
  console.log(
    "No drift: the migrations build exactly what schema.prisma declares."
  );
} else if (result.status === 2) {
  console.error(result.stdout);
  console.error(
    [
      "Drift: replaying the migrations does not give the database schema.prisma declares.",
      "The SQL above is what `prisma migrate dev` would generate to close the gap.",
      "- After editing schema.prisma: run `pnpm db:migrate` to create the migration.",
      "- After hand-writing SQL in a migration: declare the same thing in schema.prisma",
      "  (an @@index with ops/type, a @default), or the next `migrate dev` will undo it.",
    ].join("\n")
  );
  process.exit(1);
} else {
  console.error(result.stdout);
  process.exit(result.status ?? 1);
}
