import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { hashPassword } from "better-auth/crypto";
import { Client } from "pg";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@nitap/database";
import {
  assertPerfDatabase,
  generatePerfData,
  writePerfData,
} from "@nitap/database/perf";
import { runSeed } from "@nitap/database/seed";

/**
 * The performance seed. Creates and migrates the `_perf`
 * database if needed, refuses one that already has members (pass --reset to drop and recreate it), writes the
 * base seed and the generated rows, then writes `perf/.data/fixture.json` for the k6 scenarios: load-user
 * cookies signed with BETTER_AUTH_SECRET exactly as Better Auth signs them, so the server accepts them.
 *
 *   pnpm perf:seed -- --users 10000 [--seed 1] [--sessions 2000] [--spike-capacity 500] [--reset]
 *
 * PERF_DATABASE_URL defaults to DATABASE_URL with the database renamed to `alumini_perf`.
 */
const root = path.resolve(import.meta.dirname, "../../..");

/** Better Auth's session cookie value (better-call signCookieValue): `token.base64(HMAC-SHA256)`, URI-encoded. */
export function signSessionCookie(token: string, secret: string): string {
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  return encodeURIComponent(`${token}.${signature}`);
}

async function main() {
  const { values: args } = parseArgs({
    // pnpm forwards the `--` separator itself.
    args: process.argv.slice(2).filter((arg) => arg !== "--"),
    options: {
      users: { type: "string", default: "10000" },
      seed: { type: "string", default: "1" },
      sessions: { type: "string", default: "2000" },
      "spike-capacity": { type: "string", default: "500" },
      reset: { type: "boolean", default: false },
      out: {
        type: "string",
        default: path.join(root, "perf/.data/fixture.json"),
      },
    },
  });
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
  const base = process.env.PERF_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!base) throw new Error("PERF_DATABASE_URL (or DATABASE_URL) is not set");
  const url = new URL(base);
  if (!process.env.PERF_DATABASE_URL) url.pathname = "/alumini_perf";
  const databaseUrl = url.toString();
  const name = assertPerfDatabase(databaseUrl);

  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/postgres";
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  if (args.reset) {
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  }
  const exists = await admin.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [name]
  );
  if (exists.rowCount === 0) await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();

  console.log(`Migrating ${name}…`);
  execFileSync("pnpm", ["--filter", "@nitap/database", "db:deploy"], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: ["ignore", "ignore", "inherit"],
  });

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const members = await prisma.user.count();
    if (members > 0) {
      throw new Error(
        `${name} already has ${members} users; rerun with --reset to rebuild it.`
      );
    }
    await runSeed(prisma);
    const [departments, degrees, roles] = await Promise.all([
      prisma.department.findMany({
        select: { id: true, code: true },
        orderBy: { code: "asc" },
      }),
      prisma.degree.findMany({
        select: { id: true, code: true },
        orderBy: { code: "asc" },
      }),
      prisma.role.findMany({ select: { id: true, name: true } }),
    ]);

    const options = {
      users: Number(args.users),
      seed: Number(args.seed),
      sessions: Number(args.sessions),
      spikeCapacity: Number(args["spike-capacity"]),
      // Day granularity: the same day reproduces the same rows.
      now: new Date(new Date().toISOString().slice(0, 10) + "T12:00:00Z"),
    };
    const started = Date.now();
    const data = generatePerfData(options, {
      departments,
      degrees,
      roleIds: Object.fromEntries(roles.map((r) => [r.name, r.id])),
    });
    const password = process.env.PERF_PASSWORD ?? "perf-password-1234";
    await writePerfData(
      client,
      data.tables,
      await hashPassword(password),
      (table, rows) =>
        console.log(`  ${table.padEnd(26)} ${rows.toLocaleString("en-US")}`)
    );
    console.log(
      `Seeded ${name} in ${((Date.now() - started) / 1000).toFixed(1)} s.`
    );

    const fixture = {
      ...data.fixture,
      password,
      cookieName: "better-auth.session_token",
      loadUsers: data.fixture.loadUsers.map(({ userId, email, token }) => ({
        userId,
        email,
        cookie: signSessionCookie(token, secret),
      })),
    };
    mkdirSync(path.dirname(args.out), { recursive: true });
    writeFileSync(args.out, JSON.stringify(fixture));
    console.log(
      `Fixture: ${path.relative(root, args.out)} (${fixture.loadUsers.length} load users).`
    );
  } finally {
    await client.end();
    await prisma.$disconnect();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
