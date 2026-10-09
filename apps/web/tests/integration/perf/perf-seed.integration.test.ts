import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  assertPerfDatabase,
  generatePerfData,
  writePerfData,
  type PerfData,
} from "@nitap/database/perf";
import { runSeed } from "@nitap/database/seed";

import { createAuth } from "@/modules/auth/infrastructure/auth-factory";
import { createPostgresSearch } from "@/modules/directory/infrastructure/postgres-search";
import { parseDirectoryQuery } from "@nitap/search";

import { signSessionCookie } from "../../../scripts/perf-seed";
import type { TestDatabase } from "../../support/test-database";
import { createTestDatabase } from "../../support/test-database";

const SECRET = "perf-secret-perf-secret-perf-secret-0000";

/**
 * the performance seed is "verified by an integration test that loads a small variant". The
 * full run is `pnpm perf:seed`; this proves the same generator and writer satisfy every constraint of the
 * current schema, and that the minted cookies are ones Better Auth accepts.
 */
describe("performance seed (small variant, real PostgreSQL)", () => {
  let db: TestDatabase;
  let data: PerfData;

  beforeAll(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    const [departments, degrees, roles] = await Promise.all([
      db.prisma.department.findMany({ select: { id: true, code: true } }),
      db.prisma.degree.findMany({ select: { id: true, code: true } }),
      db.prisma.role.findMany({ select: { id: true, name: true } }),
    ]);
    data = generatePerfData(
      { users: 300, seed: 7, now: new Date(), sessions: 20, spikeCapacity: 50 },
      {
        departments,
        degrees,
        roleIds: Object.fromEntries(roles.map((r) => [r.name, r.id])),
      }
    );
    const client = new Client({ connectionString: db.databaseUrl });
    await client.connect();
    try {
      await writePerfData(client, data.tables, "not-a-real-hash");
    } finally {
      await client.end();
    }
  }, 120_000);

  afterAll(async () => {
    await db?.drop();
  });

  it("writes every generated row", async () => {
    const client = new Client({ connectionString: db.databaseUrl });
    await client.connect();
    try {
      for (const { table, rows } of data.tables) {
        const { rows: counted } = await client.query<{ n: string }>(
          `SELECT count(*) AS n FROM "${table}"`
        );
        // The base seed adds no rows to these tables.
        expect({ table, n: Number(counted[0]!.n) }).toEqual({
          table,
          n: rows.length,
        });
      }
    } finally {
      await client.end();
    }
  });

  it("leaves the message sequence past the seeded rows, so the next send does not collide", async () => {
    const [row] = await db.prisma.$queryRaw<{ max: bigint; next: bigint }[]>`
      SELECT (SELECT max(seq) FROM message) AS max, nextval(pg_get_serial_sequence('message', 'seq')) AS next`;
    expect(row!.next).toBe(row!.max + 1n);
  });

  it("mints a session cookie that Better Auth accepts", async () => {
    const auth = createAuth({
      prisma: db.prisma,
      baseURL: "http://localhost:3000",
      secret: SECRET,
      nextCookies: false,
      authEmails: {} as never,
      provisionMember: async () => ({ created: false }),
      applyEmailVerification: async () => ({ outcome: "unchanged" }) as never,
    });
    const user = data.fixture.loadUsers[0]!;
    const session = await auth.api.getSession({
      headers: new Headers({
        cookie: `better-auth.session_token=${signSessionCookie(user.token, SECRET)}`,
      }),
    });
    expect(session?.user.id).toBe(user.userId);

    const forged = await auth.api.getSession({
      headers: new Headers({
        cookie: `better-auth.session_token=${signSessionCookie(user.token, "another-secret-another-secret-00")}`,
      }),
    });
    expect(forged).toBeNull();
  });

  it("gives the directory search something to find", async () => {
    const search = createPostgresSearch(db.prisma);
    const viewer = { userId: data.fixture.loadUsers[0]!.userId };
    const parsed = parseDirectoryQuery(new URLSearchParams({ limit: "20" }));
    if (!parsed.ok) throw new Error("bad query");
    const page = await search.searchPeople(parsed.query, viewer as never);
    expect(page.hits).toHaveLength(20);
    expect(page.nextCursor).not.toBeNull();
  });

  it("refuses to seed a database whose name does not end in _perf", () => {
    expect(() =>
      assertPerfDatabase("postgresql://u:p@localhost/alumini")
    ).toThrow(/_perf/);
    expect(assertPerfDatabase("postgresql://u:p@localhost/alumini_perf")).toBe(
      "alumini_perf"
    );
  });
});
