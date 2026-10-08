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

export async function grantRuntimeRole(
  db: Pick<PrismaClient, "$transaction">,
  options: { role?: string; password: string }
) {
  const role = options.role ?? RUNTIME_ROLE;
  // Role statements take no bind parameters, so the name and password reach this fixed block as
  // transaction-local settings, and format(%I, %L) quotes them inside the database.
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('alumini.runtime_role', ${role}, true),
                                set_config('alumini.runtime_password', ${options.password}, true)`;
    await tx.$executeRaw`DO $grant$
      DECLARE
        r text := current_setting('alumini.runtime_role');
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = r) THEN
          EXECUTE format('CREATE ROLE %I', r);
        END IF;
        EXECUTE format(
          'ALTER ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L',
          r, current_setting('alumini.runtime_password'));
        EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), r);
        EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', r);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', r);
        EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', r);
        EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM %I', r);
        EXECUTE format('REVOKE ALL ON _prisma_migrations FROM %I', r);
      END
    $grant$`;
  });
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
