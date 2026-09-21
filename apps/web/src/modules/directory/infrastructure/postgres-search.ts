import { Prisma, type PrismaClient } from "@nitap/database";
import {
  decodeCursor,
  encodeCursor,
  type DirectoryQuery,
  type PersonHit,
  type SearchPort,
  type Sort,
} from "@nitap/search";

/** Below the default 0.6 so a one-letter typo in a name still matches; the trigram GIN index serves `<%`. */
const TYPO_THRESHOLD = "0.45";

/** Sort key expression, its SQL cast for the cursor value, and its direction. Ties always break on user_id ASC. */
const KEYS: Record<
  Sort,
  { cast: string; desc: boolean; expr: (q: DirectoryQuery) => Prisma.Sql }
> = {
  name: {
    cast: "text",
    desc: false,
    expr: () => Prisma.sql`lower(p.full_name)`,
  },
  graduationYear: {
    cast: "int",
    desc: false,
    expr: () => Prisma.sql`COALESCE(p.graduation_year, 9999)`,
  },
  "-graduationYear": {
    cast: "int",
    desc: true,
    expr: () => Prisma.sql`COALESCE(p.graduation_year, -1)`,
  },
  relevance: { cast: "numeric", desc: true, expr: relevanceScore },
};

const like = (value: string) => `%${value.replace(/[\\%_]/g, "\\$&")}%`;

function relevanceScore(query: DirectoryQuery): Prisma.Sql {
  const pattern = like(query.q ?? "");
  // Name matches rank above headline, headline above company/skill; the rest is trigram similarity.
  return Prisma.sql`ROUND(GREATEST(
      word_similarity(${query.q}, p.full_name),
      CASE WHEN p.headline ILIKE ${pattern} THEN 0.5 ELSE 0 END,
      CASE WHEN p.full_name ILIKE ${pattern} THEN 0.9 ELSE 0 END
    )::numeric, 3)`;
}

/**
 * Stage A of TDS §14: the directory query straight against PostgreSQL, so there is no index to lag or
 * rebuild. Visibility is applied here, in the WHERE clause and per section — a hidden section can neither
 * be shown nor be used to match, or a search on "Acme" would reveal a hidden employer. This file is the
 * only place that reads profile tables for the directory.
 */
export function createPostgresSearch(prisma: PrismaClient): SearchPort {
  return {
    async searchPeople(query, viewer) {
      const reach = Prisma.sql`${viewer.reach === "everything" ? "PRIVATE" : "MEMBERS_ONLY"}::"ProfileVisibility"`;
      const sectionVisible = (column: string) =>
        Prisma.sql`COALESCE(${Prisma.raw(`p.${column}_visibility`)}, p.visibility) <= ${reach}`;
      const experienceVisible = sectionVisible("experience");

      const where: Prisma.Sql[] = [
        Prisma.sql`u.account_state = 'VERIFIED'`,
        Prisma.sql`p.visibility <= ${reach}`,
      ];

      if (query.q) {
        const pattern = like(query.q);
        // A UNION of single-index lookups, not an OR over correlated EXISTS: the planner can then use each
        // trigram index instead of scanning every profile. The experience and skill branches are gated by
        // the experience section's visibility, so a hidden employer or skill cannot match.
        where.push(Prisma.sql`p.user_id IN (
          SELECT user_id FROM profile WHERE full_name ILIKE ${pattern}
          UNION SELECT user_id FROM profile WHERE full_name %> ${query.q}
          UNION SELECT user_id FROM profile WHERE headline ILIKE ${pattern}
          UNION SELECT e.user_id FROM profile_experience e JOIN profile pe ON pe.user_id = e.user_id
            WHERE e.company ILIKE ${pattern} AND COALESCE(pe.experience_visibility, pe.visibility) <= ${reach}
          UNION SELECT s.user_id FROM profile_skill s JOIN profile ps ON ps.user_id = s.user_id
            WHERE s.skill ILIKE ${pattern} AND COALESCE(ps.experience_visibility, ps.visibility) <= ${reach}
        )`);
      }
      if (query.department.length > 0) {
        where.push(
          Prisma.sql`p.department_id IN (SELECT id FROM department WHERE code = ANY(${query.department}::text[]))`
        );
      }
      if (query.graduationYear.length > 0) {
        where.push(
          Prisma.sql`p.graduation_year = ANY(${query.graduationYear}::int[])`
        );
      }
      if (query.graduationYearFrom !== undefined) {
        where.push(
          Prisma.sql`p.graduation_year >= ${query.graduationYearFrom}`
        );
      }
      if (query.graduationYearTo !== undefined) {
        where.push(Prisma.sql`p.graduation_year <= ${query.graduationYearTo}`);
      }
      if (query.location) {
        where.push(
          Prisma.sql`(${sectionVisible("location")} AND p.location ILIKE ${like(query.location)})`
        );
      }
      // One experience row must satisfy every given company/industry/designation term together.
      const job = (
        [
          ["company", query.company],
          ["industry", query.industry],
          ["designation", query.designation],
        ] as const
      ).flatMap(([column, value]) =>
        value
          ? [Prisma.sql`${Prisma.raw(`e.${column}`)} ILIKE ${like(value)}`]
          : []
      );
      if (job.length > 0) {
        where.push(Prisma.sql`(${experienceVisible} AND EXISTS (
          SELECT 1 FROM profile_experience e WHERE e.user_id = p.user_id AND ${Prisma.join(job, " AND ")}))`);
      }
      for (const skill of query.skills) {
        where.push(Prisma.sql`(${experienceVisible} AND EXISTS (
          SELECT 1 FROM profile_skill s WHERE s.user_id = p.user_id AND lower(s.skill) = lower(${skill})))`);
      }

      const key = KEYS[query.sort];
      const keyExpr = key.expr(query);
      const cast = Prisma.raw(key.cast);
      const dir = Prisma.raw(key.desc ? "DESC" : "ASC");
      if (query.cursor) {
        const after = decodeCursor(query.cursor, query.sort);
        const beyond = Prisma.raw(key.desc ? "<" : ">");
        where.push(Prisma.sql`(
          ${keyExpr} ${beyond} ${after.value}::${cast}
          OR (${keyExpr} = ${after.value}::${cast} AND p.user_id > ${after.id}::uuid))`);
      }

      const rows = await prisma.$transaction(async (tx) => {
        // Transaction-local, so it cannot leak onto the pooled connection.
        await tx.$executeRaw`SELECT set_config('pg_trgm.word_similarity_threshold', ${TYPO_THRESHOLD}, true)`;
        // The inner query pages by key; the outer one only decorates the (at most limit + 1) survivors.
        return tx.$queryRaw<(PersonHit & { sortKey: string })[]>`
          SELECT page.sort_key::text AS "sortKey",
                 p.user_id AS "userId", p.full_name AS "fullName", p.headline,
                 d.name AS department, g.name AS degree, p.graduation_year AS "graduationYear",
                 CASE WHEN ${sectionVisible("location")} THEN p.location END AS location,
                 cur.company AS "currentCompany", cur.designation AS "currentDesignation",
                 (p.photo_upload_id IS NOT NULL) AS "hasPhoto"
          FROM (
            SELECT p.user_id, ${keyExpr} AS sort_key
            FROM profile p
            JOIN "user" u ON u.id = p.user_id
            WHERE ${Prisma.join(where, " AND ")}
            ORDER BY sort_key ${dir}, p.user_id ASC
            LIMIT ${query.limit + 1}
          ) page
          JOIN profile p ON p.user_id = page.user_id
          LEFT JOIN department d ON d.id = p.department_id
          LEFT JOIN degree g ON g.id = p.degree_id
          LEFT JOIN LATERAL (
            SELECT e.company, e.designation FROM profile_experience e
            WHERE e.user_id = p.user_id AND e.is_current AND ${experienceVisible}
            ORDER BY e.start_date DESC, e.id LIMIT 1
          ) cur ON true
          ORDER BY page.sort_key ${dir}, p.user_id ASC`;
      });

      const more = rows.length > query.limit;
      const kept = more ? rows.slice(0, query.limit) : rows;
      const last = kept.at(-1);
      return {
        hits: kept.map((row) => {
          const hit: Partial<typeof row> = { ...row };
          delete hit.sortKey;
          return hit as PersonHit;
        }),
        nextCursor:
          more && last
            ? encodeCursor(query.sort, { value: last.sortKey, id: last.userId })
            : null,
      };
    },
  };
}

/** Department options for the filter form: active departments by code. */
export function createListDepartments(prisma: PrismaClient) {
  return async () =>
    prisma.department.findMany({
      where: { isActive: true },
      select: { code: true, name: true },
      orderBy: { name: "asc" },
    });
}
