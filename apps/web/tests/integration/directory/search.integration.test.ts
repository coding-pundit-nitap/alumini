import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { runSeed } from "@nitap/database/seed";
import {
  InvalidCursorError,
  parseDirectoryQuery,
  type DirectoryQuery,
  type SearchViewer,
} from "@nitap/search";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createPostgresSearch } from "@/modules/directory/infrastructure/postgres-search";

type Level = "PUBLIC" | "MEMBERS_ONLY" | "CONNECTIONS_ONLY" | "PRIVATE";

// A valid UUID that belongs to no user: the query compares it with connection.user_a_id / user_b_id.
const VIEWER_ID = "00000000-0000-4000-8000-000000000001";
const MEMBER: SearchViewer = { userId: VIEWER_ID };

function query(params: Record<string, string | string[]> = {}): DirectoryQuery {
  const parsed = parseDirectoryQuery(params);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.problems));
  return parsed.query;
}

describe("directory search against real PostgreSQL", () => {
  let db: TestDatabase;
  let n = 0;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    n = 0;
  });
  afterEach(async () => {
    await db.drop();
  });

  const search = () => createPostgresSearch(db.prisma);
  const names = async (
    params: Record<string, string | string[]>,
    viewer = MEMBER
  ) =>
    (await search().searchPeople(query(params), viewer)).hits.map(
      (h) => h.fullName
    );

  async function person(
    fullName: string,
    opts: {
      state?: "VERIFIED" | "PENDING" | "SUSPENDED";
      visibility?: Level;
      experienceVisibility?: Level;
      locationVisibility?: Level;
      department?: string;
      year?: number;
      location?: string;
      headline?: string;
      company?: string;
      designation?: string;
      isCurrent?: boolean;
      skills?: string[];
    } = {}
  ) {
    n += 1;
    const user = await db.prisma.user.create({
      data: {
        name: fullName,
        email: `u${n}@example.test`,
        accountState: opts.state ?? "VERIFIED",
      },
    });
    const department = opts.department
      ? await db.prisma.department.findUniqueOrThrow({
          where: { code: opts.department },
        })
      : null;
    await db.prisma.profile.create({
      data: {
        userId: user.id,
        fullName,
        headline: opts.headline,
        location: opts.location,
        graduationYear: opts.year,
        departmentId: department?.id,
        visibility: opts.visibility ?? "MEMBERS_ONLY",
        experienceVisibility: opts.experienceVisibility,
        locationVisibility: opts.locationVisibility,
        ...(opts.company
          ? {
              experience: {
                create: {
                  company: opts.company,
                  designation: opts.designation ?? "Engineer",
                  startDate: new Date("2020-01-01"),
                  isCurrent: opts.isCurrent ?? true,
                },
              },
            }
          : {}),
        ...(opts.skills
          ? { skills: { create: opts.skills.map((skill) => ({ skill })) } }
          : {}),
      },
    });
    return user.id;
  }

  describe("matching", () => {
    beforeEach(async () => {
      await person("Asha Rao", {
        company: "Acme Robotics",
        skills: ["Go", "Postgres"],
        department: "CSE",
        year: 2019,
        location: "Bengaluru",
      });
      await person("Ravi Kumar", {
        company: "Globex",
        skills: ["Go"],
        department: "ECE",
        year: 2021,
        location: "Hyderabad",
      });
      await person("Meera Nair", {
        company: "Acme Robotics",
        skills: ["Rust"],
        department: "CSE",
        year: 2021,
        location: "Bengaluru",
      });
    });

    it("finds by name: full, partial and with a typo", async () => {
      expect(await names({ q: "Asha Rao" })).toContain("Asha Rao");
      expect(await names({ q: "ravi" })).toEqual(["Ravi Kumar"]);
      expect(await names({ q: "Ashaa" })).toContain("Asha Rao");
      expect(await names({ q: "Meara Nair" })).toContain("Meera Nair");
    });

    it("finds by company and by skill", async () => {
      expect((await names({ q: "acme" })).sort()).toEqual([
        "Asha Rao",
        "Meera Nair",
      ]);
      expect(await names({ q: "rust" })).toEqual(["Meera Nair"]);
    });

    it("treats LIKE wildcards in the term as literal text", async () => {
      expect(await names({ q: "%%" })).toEqual([]);
      expect(await names({ q: "a_h" })).toEqual([]);
    });

    it("filters by batch, department and location", async () => {
      expect((await names({ graduationYear: "2021" })).sort()).toEqual([
        "Meera Nair",
        "Ravi Kumar",
      ]);
      expect(
        await names({ graduationYearFrom: "2020", graduationYearTo: "2022" })
      ).toHaveLength(2);
      expect((await names({ department: "CSE" })).sort()).toEqual([
        "Asha Rao",
        "Meera Nair",
      ]);
      expect((await names({ location: "bengal" })).sort()).toEqual([
        "Asha Rao",
        "Meera Nair",
      ]);
    });

    it("combines filters, and every skill must match", async () => {
      expect(
        await names({ department: "CSE", graduationYear: "2021" })
      ).toEqual(["Meera Nair"]);
      expect(
        await names({
          company: "acme",
          location: "Bengaluru",
          department: "CSE",
          q: "asha",
        })
      ).toEqual(["Asha Rao"]);
      expect(await names({ skills: ["go", "postgres"] })).toEqual(["Asha Rao"]);
      expect(await names({ skills: ["go", "rust"] })).toEqual([]);
    });

    it("requires company and designation to hold on the same job", async () => {
      await person("Dev Patel", {
        company: "Acme Robotics",
        designation: "Designer",
      });
      expect(await names({ company: "acme", designation: "designer" })).toEqual(
        ["Dev Patel"]
      );
      expect(
        await names({ company: "globex", designation: "designer" })
      ).toEqual([]);
    });

    it("shows the current employer and the institutional names", async () => {
      const { hits } = await search().searchPeople(
        query({ q: "asha" }),
        MEMBER
      );
      expect(hits[0]).toMatchObject({
        fullName: "Asha Rao",
        currentCompany: "Acme Robotics",
        currentDesignation: "Engineer",
        department: "Computer Science and Engineering",
        graduationYear: 2019,
        location: "Bengaluru",
        hasPhoto: false,
      });
    });

    it("ranks a name match above a company match", async () => {
      await person("Acme Sharma");
      expect((await names({ q: "acme" }))[0]).toBe("Acme Sharma");
    });
  });

  describe("connections and blocks (Phase 5)", () => {
    /** Writes the pair's row directly, in canonical order, as the connections module would. */
    async function link(
      x: string,
      y: string,
      state: "ACCEPTED" | "PENDING" | "BLOCKED",
      by = x
    ) {
      const [userAId, userBId] = [x, y].sort() as [string, string];
      await db.prisma.connection.create({
        data: {
          userAId,
          userBId,
          requestedById: by,
          state,
          blockedById: state === "BLOCKED" ? by : null,
          respondedAt: state === "PENDING" ? null : new Date(),
        },
      });
    }
    const as = (userId: string): SearchViewer => ({ userId });

    it("shows a connections-only member to an accepted connection, and to nobody else", async () => {
      const viewer = await person("Viewer Vik");
      const circle = await person("Circle Cy", {
        visibility: "CONNECTIONS_ONLY",
      });
      await person("Other Olu");
      await link(viewer, circle, "ACCEPTED");

      expect(await names({ q: "Circle" }, as(viewer))).toEqual(["Circle Cy"]);
      expect(await names({ q: "Circle" }, MEMBER)).toEqual([]);
    });

    it("does not count a pending request as a connection", async () => {
      const viewer = await person("Viewer Vik");
      const circle = await person("Circle Cy", {
        visibility: "CONNECTIONS_ONLY",
      });
      await link(viewer, circle, "PENDING");
      expect(await names({ q: "Circle" }, as(viewer))).toEqual([]);
    });

    it("shows a connections-only section (experience) only to connections, and never leaks it by matching", async () => {
      const viewer = await person("Viewer Vik");
      const asha = await person("Asha Rao", {
        company: "Acme Robotics",
        experienceVisibility: "CONNECTIONS_ONLY",
      });
      await person("Bystander Bo");
      expect(await names({ company: "acme" }, MEMBER)).toEqual([]);
      expect(await names({ q: "acme" }, MEMBER)).toEqual([]);

      await link(viewer, asha, "ACCEPTED");
      expect(await names({ company: "acme" }, as(viewer))).toEqual([
        "Asha Rao",
      ]);
      expect(await names({ q: "acme" }, as(viewer))).toEqual(["Asha Rao"]);
    });

    it("hides a blocked pair from each other, whichever side blocked", async () => {
      const blocker = await person("Blocker Bea");
      const blocked = await person("Blocked Bob");
      await person("Cara Dell");
      await link(blocker, blocked, "BLOCKED", blocker);

      expect(await names({}, as(blocker))).not.toContain("Blocked Bob");
      expect(await names({}, as(blocked))).not.toContain("Blocker Bea");
      expect(await names({ q: "Bob" }, as(blocker))).toEqual([]);
      expect(await names({}, as(blocker))).toContain("Cara Dell");
    });

    it("a block wins over an earlier connection level: a public profile is still hidden", async () => {
      const blocker = await person("Blocker Bea", { visibility: "PUBLIC" });
      const blocked = await person("Blocked Bob", { visibility: "PUBLIC" });
      await link(blocker, blocked, "BLOCKED", blocked);
      expect(await names({}, as(blocker))).not.toContain("Blocked Bob");
      expect(await names({}, as(blocked))).not.toContain("Blocker Bea");
    });
  });

  describe("visibility", () => {
    it("leaves out private, connections-only, unverified and suspended members", async () => {
      await person("Visible Vera");
      await person("Public Pat", { visibility: "PUBLIC" });
      await person("Private Pia", { visibility: "PRIVATE" });
      await person("Circle Cy", { visibility: "CONNECTIONS_ONLY" });
      await person("Pending Pam", { state: "PENDING" });
      await person("Suspended Sam", { state: "SUSPENDED" });

      expect((await names({})).sort()).toEqual(["Public Pat", "Visible Vera"]);
      // A private member is not findable by name either — not even an exact one.
      expect(await names({ q: "Private Pia" })).toEqual([]);
      expect(await names({ q: "Pending Pam" })).toEqual([]);
    });

    it("does not list private profiles to anyone, administrators included", async () => {
      // Admins reach a private profile by id, which is audited; a listing would not be.
      await person("Visible Vera");
      await person("Private Pia", { visibility: "PRIVATE" });
      expect(await names({})).toEqual(["Visible Vera"]);
    });

    it("never matches on, filters by or shows a hidden section", async () => {
      await person("Hidden Hal", {
        company: "Secretco",
        skills: ["Cobol"],
        location: "Nowhere",
        experienceVisibility: "PRIVATE",
        locationVisibility: "PRIVATE",
      });
      expect(await names({ q: "secretco" })).toEqual([]);
      expect(await names({ q: "cobol" })).toEqual([]);
      expect(await names({ company: "secretco" })).toEqual([]);
      expect(await names({ skills: "cobol" })).toEqual([]);
      expect(await names({ location: "nowhere" })).toEqual([]);

      const { hits } = await search().searchPeople(query({ q: "hal" }), MEMBER);
      expect(hits[0]).toMatchObject({
        fullName: "Hidden Hal",
        currentCompany: null,
        location: null,
      });
    });

    it("returns no totals or counts, so a private profile cannot leak through them", async () => {
      await person("Visible Vera");
      await person("Private Pia", { visibility: "PRIVATE" });
      const page = await search().searchPeople(query(), MEMBER);
      expect(Object.keys(page).sort()).toEqual(["hits", "nextCursor"]);
    });
  });

  describe("pagination", () => {
    beforeEach(async () => {
      // Deliberate ties: many share a name and a year, so only the id tiebreak keeps pages stable.
      for (let i = 0; i < 23; i++) {
        await person(
          i % 3 === 0 ? "Twin Name" : `Person ${String(i).padStart(2, "0")}`,
          {
            year: i % 5 === 0 ? undefined : 2015 + (i % 4),
            headline: i % 2 === 0 ? "twin headline" : undefined,
          }
        );
      }
    });

    async function walk(params: Record<string, string>) {
      const seen: string[] = [];
      let cursor: string | null = null;
      for (let pages = 0; pages < 20; pages++) {
        const page = await search().searchPeople(
          query({ ...params, limit: "5", ...(cursor ? { cursor } : {}) }),
          MEMBER
        );
        seen.push(...page.hits.map((h) => h.userId));
        cursor = page.nextCursor;
        if (!cursor) break;
      }
      return seen;
    }

    it.each([
      ["name", {}],
      ["graduationYear", { sort: "graduationYear" }],
      ["-graduationYear", { sort: "-graduationYear" }],
      ["relevance", { q: "twin" }],
    ])(
      "pages through %s order without duplicates or gaps",
      async (_sort, params) => {
        const seen = await walk(params);
        const all = (
          await search().searchPeople(query({ ...params, limit: "50" }), MEMBER)
        ).hits.map((h) => h.userId);
        expect(new Set(seen).size).toBe(seen.length);
        expect(seen).toEqual(all);
        expect(seen.length).toBeGreaterThan(5);
      }
    );

    it("sorts a missing batch last in both directions", async () => {
      for (const sort of ["graduationYear", "-graduationYear"]) {
        const { hits } = await search().searchPeople(
          query({ sort, limit: "50" }),
          MEMBER
        );
        const years = hits.map((h) => h.graduationYear);
        const firstNull = years.indexOf(null);
        expect(years.slice(firstNull).every((y) => y === null)).toBe(true);
      }
    });

    it("rejects a cursor that was tampered with or minted for another sort", async () => {
      const first = await search().searchPeople(query({ limit: "5" }), MEMBER);
      expect(first.nextCursor).not.toBeNull();
      await expect(
        search().searchPeople(query({ cursor: "garbage" }), MEMBER)
      ).rejects.toBeInstanceOf(InvalidCursorError);
      await expect(
        search().searchPeople(
          query({ sort: "graduationYear", cursor: first.nextCursor! }),
          MEMBER
        )
      ).rejects.toBeInstanceOf(InvalidCursorError);
    });
  });
});

describe("directory query plans (strategy §9.4)", () => {
  // One database for the whole block: every test here only EXPLAINs, so the 120 000-row setup runs once.
  let db: TestDatabase;
  afterAll(async () => {
    await db.drop();
  });
  let known = "";
  // Enough rows that a sequential scan is visibly the wrong choice; the profile mix is realistic:
  // mostly MEMBERS_ONLY, a tail of PRIVATE, a few departments, years 2010–2024.
  beforeAll(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    await db.prisma.$executeRaw`
      INSERT INTO "user" (id, name, email, account_state, updated_at)
      SELECT gen_random_uuid(), 'User ' || g, 'bulk' || g || '@example.test', 'VERIFIED', now()
      FROM generate_series(1, 30000) g`;
    await db.prisma.$executeRaw`
      INSERT INTO profile (user_id, full_name, bio, headline, location, graduation_year, department_id, visibility, updated_at)
      SELECT u.id,
             initcap(substr(md5(u.n::text), 1, 7)) || ' ' || initcap(substr(md5((u.n + 7)::text), 1, 9)),
             repeat(md5(random()::text), 10), -- realistic row width, or a scan is honestly cheaper
             'Engineer number ' || u.n,
             (ARRAY['Bengaluru','Hyderabad','Pune','Delhi','Chennai'])[1 + u.n % 5],
             2010 + u.n % 15,
             d.id,
             CASE u.n % 10 WHEN 0 THEN 'PRIVATE'::"ProfileVisibility"
                           WHEN 5 THEN 'CONNECTIONS_ONLY'::"ProfileVisibility"
                           ELSE 'MEMBERS_ONLY'::"ProfileVisibility" END,
             now()
      FROM (SELECT id, (row_number() OVER ())::int AS n FROM "user" WHERE email LIKE 'bulk%') u
      JOIN (SELECT id, (row_number() OVER (ORDER BY code))::int - 1 AS k FROM department) d ON d.k = u.n % 5`;
    await db.prisma.$executeRaw`
      INSERT INTO profile_experience (user_id, company, designation, start_date, is_current, updated_at)
      SELECT user_id, 'Company ' || (row_number() OVER ())::int % 500, 'Engineer', DATE '2020-01-01', true, now() FROM profile WHERE full_name LIKE '%1'`;
    // A network to go with them (Phase 15 F-1): each member connected to the next three, ~90 000 pairs, as a
    // 10 000-member network has. Without it a full scan of `connection` costs nothing and hides.
    await db.prisma.$executeRaw`
      WITH bulk AS (SELECT id, (row_number() OVER (ORDER BY email))::int AS n,
                            lead(id, 1) OVER w AS n1, lead(id, 2) OVER w AS n2, lead(id, 3) OVER w AS n3
                     FROM "user" WHERE email LIKE 'bulk%' WINDOW w AS (ORDER BY email)),
           pairs AS (SELECT id, n, other FROM bulk, LATERAL (VALUES (n1), (n2), (n3)) AS v(other) WHERE other IS NOT NULL)
      INSERT INTO connection (user_a_id, user_b_id, requested_by_id, blocked_by_id, state, responded_at)
      SELECT LEAST(id, other), GREATEST(id, other), id,
             CASE WHEN n % 97 = 0 THEN id END,
             CASE WHEN n % 97 = 0 THEN 'BLOCKED'::"ConnectionState" ELSE 'ACCEPTED'::"ConnectionState" END,
             CASE WHEN n % 97 = 0 THEN NULL ELSE now() END
      FROM pairs`;
    await db.prisma.$executeRawUnsafe("ANALYZE");
    const [row] = await db.prisma.$queryRaw<{ full_name: string }[]>`
      SELECT full_name FROM profile WHERE headline = 'Engineer number 777'`;
    known = row!.full_name;
  }, 120_000);

  /** The adapter's own SQL and parameters, captured from a query log of one real call. */
  async function capture(
    params: Record<string, string>
  ): Promise<{ sql: string; values: unknown[] }> {
    const logged: string[] = [];
    const { PrismaClient } = await import("@nitap/database");
    const { PrismaPg } = await import("@prisma/adapter-pg");
    const probe = new PrismaClient({
      adapter: new PrismaPg({ connectionString: db.databaseUrl }),
      log: [{ emit: "event", level: "query" }],
    });
    (
      probe as unknown as {
        $on: (
          e: string,
          f: (q: { query: string; params: string }) => void
        ) => void;
      }
    ).$on("query", (e) => {
      if (
        e.query.includes("word_similarity") === false &&
        e.query.includes("ORDER BY page.sort_key") === false
      )
        return;
      logged.push(JSON.stringify({ sql: e.query, params: e.params }));
    });
    await createPostgresSearch(probe).searchPeople(query(params), MEMBER);
    await probe.$disconnect();
    const entry = JSON.parse(logged.at(-1) ?? "null") as {
      sql: string;
      params: string;
    } | null;
    if (!entry) throw new Error("no query captured");
    return { sql: entry.sql, values: JSON.parse(entry.params) as unknown[] };
  }

  async function planFor(params: Record<string, string>): Promise<string> {
    const { sql, values } = await capture(params);
    const rows = await db.prisma.$queryRawUnsafe<{ "QUERY PLAN": string }[]>(
      `EXPLAIN (COSTS OFF) ${sql}`,
      ...values
    );
    return rows.map((r) => r["QUERY PLAN"]).join("\n");
  }

  type PlanNode = {
    "Relation Name"?: string;
    "Actual Rows"?: number;
    "Actual Loops"?: number;
    Plans?: PlanNode[];
  };
  /** Rows the executed query actually read from `connection`, over every node and loop. */
  async function connectionRowsRead(
    params: Record<string, string>
  ): Promise<number> {
    const { sql, values } = await capture(params);
    const [row] = await db.prisma.$queryRawUnsafe<
      { "QUERY PLAN": { Plan: PlanNode }[] }[]
    >(`EXPLAIN (ANALYZE, FORMAT JSON) ${sql}`, ...values);
    const walk = (node: PlanNode): number =>
      (node["Relation Name"] === "connection"
        ? (node["Actual Rows"] ?? 0) * (node["Actual Loops"] ?? 1)
        : 0) + (node.Plans ?? []).reduce((sum, child) => sum + walk(child), 0);
    return walk(row!["QUERY PLAN"][0]!.Plan);
  }

  it.each([
    ["name order", {}],
    [
      "batch filter and order",
      { graduationYear: "2015", sort: "graduationYear" },
    ],
    ["batch order, newest first", { sort: "-graduationYear" }],
    ["company search", { q: "Company 42" }],
    ["exact name search", () => ({ q: known })],
    ["name search with a typo", () => ({ q: `${known.slice(0, -1)}x` })],
  ])("%s never scans the whole profile table", async (_label, params) => {
    const plan = await planFor(
      typeof params === "function" ? params() : params
    );
    expect(plan).not.toMatch(/Seq Scan on profile(?![_\w])/);
  });

  // Phase 15 F-1: the CONNECTIONS_ONLY check sat under an OR, so PostgreSQL hashed every ACCEPTED pair in the
  // network (a full scan of `connection`) on each request. Only the viewer's own pairs may be read.
  it.each([
    ["name order", {}],
    ["batch order, newest first", { sort: "-graduationYear" }],
    ["company search", { q: "Company 42" }],
    ["location filter", { location: "Pune" }],
  ])(
    "%s reads only the viewer's own connections, not the network",
    async (_label, params) => {
      expect(await connectionRowsRead(params)).toBeLessThan(1_000);
    }
  );
});
