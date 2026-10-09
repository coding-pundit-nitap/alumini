import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { grantRuntimeRole } from "@nitap/database/runtime-role";

import type { TestDatabase } from "../../support/test-database";
import { createTestDatabase } from "../../support/test-database";

// Roles are cluster-wide: each test makes its own and drops it after its database.
describe("runtime database role", () => {
  let db: TestDatabase;
  let role: string;
  let password: string;
  let app: Client;

  beforeEach(async () => {
    db = await createTestDatabase();
    role = `app_${randomBytes(6).toString("hex")}`;
    password = randomBytes(12).toString("hex");
    await grantRuntimeRole(db.prisma, { role, password });
    const url = new URL(db.databaseUrl);
    url.username = role;
    url.password = password;
    app = new Client({ connectionString: url.toString() });
    await app.connect();
  });

  afterEach(async () => {
    await app.end();
    await db.drop();
    const admin = new URL(db.databaseUrl);
    admin.pathname = "/postgres";
    const client = new Client({ connectionString: admin.toString() });
    await client.connect();
    await client.query(`DROP ROLE IF EXISTS "${role}"`);
    await client.end();
  });

  const refused = (sql: string) =>
    expect(app.query(sql)).rejects.toMatchObject({ code: "42501" });

  it("reads and writes rows, and uses sequences", async () => {
    await app.query(
      `INSERT INTO department (code, name, short_name, updated_at)
       VALUES ('ZZ', 'Runtime role test', 'RRT', now())`
    );
    await app.query("UPDATE department SET name = 'renamed' WHERE code = 'ZZ'");
    await app.query("DELETE FROM department WHERE code = 'ZZ'");
    const { rows } = await app.query<{ ok: boolean }>(
      `SELECT bool_and(has_sequence_privilege(c.oid, 'USAGE')) AS ok
         FROM pg_class c WHERE c.relkind = 'S' AND c.relnamespace = 'public'::regnamespace`
    );
    expect(rows[0]?.ok).toBe(true);
  });

  it("cannot create, alter or drop a table", async () => {
    await refused("CREATE TABLE intruder (id int)");
    await refused('ALTER TABLE "user" ADD COLUMN intruder int');
    await refused('DROP TABLE "user"');
    await refused('TRUNCATE "user" CASCADE');
  });

  it("may only insert into and read the audit log, and cannot see the migration history", async () => {
    const { rows } = await app.query<Record<string, boolean>>(
      `SELECT has_table_privilege('audit_log', 'INSERT') AS insert,
              has_table_privilege('audit_log', 'SELECT') AS select,
              has_table_privilege('audit_log', 'UPDATE') AS update,
              has_table_privilege('audit_log', 'DELETE') AS delete`
    );
    expect(rows[0]).toEqual({
      insert: true,
      select: true,
      update: false,
      delete: false,
    });
    await refused("DELETE FROM audit_log");
    await refused("SELECT 1 FROM _prisma_migrations");
  });

  it("is idempotent: running it again after a new table grants that table too", async () => {
    await db.prisma.$executeRawUnsafe("CREATE TABLE later_table (id int)");
    await grantRuntimeRole(db.prisma, { role, password });
    await app.query("INSERT INTO later_table VALUES (1)");
    await refused("DROP TABLE later_table");
  });
});
