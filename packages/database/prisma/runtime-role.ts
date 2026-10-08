import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client.ts";

/**
 * The runtime database role (reliability §9.5, spec 18D F-12). Web and worker connect as it; the migrate job
 * keeps the owner role, and runs this after every migration so a new table is granted before the release that
 * uses it starts. Rights: read and write rows, use sequences. No DDL (it owns nothing and has no CREATE on the
 * schema), so a compromised application cannot DROP or ALTER a table. The audit log is insert-only for it
 * (domain-model §2), on top of the triggers that refuse UPDATE and DELETE for everyone; the migration history
 * is out of its reach.
 */
export const RUNTIME_ROLE = "alumini_app";

type Executor = Pick<PrismaClient, "$executeRawUnsafe" | "$queryRaw">;

export async function grantRuntimeRole(
  db: Executor,
  options: { role?: string; password: string }
) {
  const role = options.role ?? RUNTIME_ROLE;
  // Identifiers and the password go through format(%I, %L): role statements take no bind parameters.
  const sql = async (template: string, ...values: string[]) => {
    const [row] = await db.$queryRaw<{ statement: string }[]>`
      SELECT format(${template}, VARIADIC ${values}::text[]) AS statement`;
    if (!row) throw new Error("format() returned no row");
    await db.$executeRawUnsafe(row.statement);
  };
  const exists = await db.$queryRaw<unknown[]>`
    SELECT 1 FROM pg_roles WHERE rolname = ${role}`;
  if (exists.length === 0) await sql("CREATE ROLE %I", role);
  await sql(
    "ALTER ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L",
    role,
    options.password
  );
  await sql(
    "GRANT CONNECT ON DATABASE %I TO %I",
    await currentDatabase(db),
    role
  );
  await sql("GRANT USAGE ON SCHEMA public TO %I", role);
  await sql(
    "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I",
    role
  );
  await sql(
    "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I",
    role
  );
  await sql("REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM %I", role);
  await sql("REVOKE ALL ON _prisma_migrations FROM %I", role);
}

async function currentDatabase(db: Executor) {
  const [row] = await db.$queryRaw<{ name: string }[]>`
    SELECT current_database() AS name`;
  if (!row) throw new Error("current_database() returned no row");
  return row.name;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const password = process.env.APP_DB_PASSWORD;
  if (!password) {
    // Local development and tests connect as the owner; deploy/compose.yml requires the variable.
    console.log("APP_DB_PASSWORD is not set: no runtime role.");
    return;
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  try {
    await grantRuntimeRole(prisma, { password });
    console.log(`Runtime role ${RUNTIME_ROLE}: granted.`);
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
