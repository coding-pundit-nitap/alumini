import { Prisma, type PrismaClient } from "@nitap/database";

import { profileVisibilitySql } from "@/infrastructure/database/profile-visibility-sql";

import type { MentorCard, MentorQueries } from "../application/mentor-ports";
import { activeMentorSql } from "./active-mentor-sql";

const like = (value: string) => `%${value.replace(/[\\%_]/g, "\\$&")}%`;

/** Discovery reads (FR-MENTOR-003). One SQL query: a few hundred mentors, and every row is privacy-filtered here. */
export function createPrismaMentorQueries(prisma: PrismaClient): MentorQueries {
  return {
    async findProfile(userId) {
      const row = await prisma.mentorProfile.findUnique({ where: { userId } });
      if (!row) return null;
      return {
        userId: row.userId,
        expertise: row.expertise,
        topics: row.topics,
        availability: row.availability,
        preferredContactMethod: row.preferredContactMethod,
        maxMentees: row.maxMentees,
        accepting: row.accepting,
      };
    },

    async list(viewerId, filter) {
      const vis = profileVisibilitySql(viewerId);
      const where: Prisma.Sql[] = [
        Prisma.sql`m.accepting`,
        Prisma.sql`m.user_id <> ${viewerId}::uuid`,
        activeMentorSql("u"),
        vis.visibleAt(Prisma.sql`p.visibility`, "p"),
        Prisma.sql`NOT ${vis.pairWith("p", "BLOCKED")}`,
      ];
      if (filter.topic)
        where.push(Prisma.sql`${filter.topic}::text = ANY(m.topics)`);
      if (filter.department) {
        where.push(
          Prisma.sql`p.department_id IN (SELECT id FROM department WHERE code = ${filter.department})`
        );
      }
      if (filter.company) {
        where.push(Prisma.sql`(${vis.sectionVisible("experience")} AND EXISTS (
          SELECT 1 FROM profile_experience e
          WHERE e.user_id = p.user_id AND e.is_current AND e.company ILIKE ${like(filter.company)}))`);
      }
      if (filter.after) {
        where.push(Prisma.sql`(lower(p.full_name) > ${filter.after.key}
          OR (lower(p.full_name) = ${filter.after.key} AND p.user_id > ${filter.after.id}::uuid))`);
      }

      if (filter.hasSpots) {
        where.push(Prisma.sql`m.max_mentees > (SELECT count(*) FROM mentorship s
          WHERE s.mentor_id = m.user_id AND s.state IN ('ACCEPTED', 'ACTIVE'))`);
      }

      return prisma.$queryRaw<MentorCard[]>`
        SELECT p.user_id AS "userId", p.full_name AS "fullName", p.headline,
               d.name AS department, cur.company AS "currentCompany",
               (p.photo_upload_id IS NOT NULL) AS "hasPhoto",
               m.expertise, m.topics, m.availability,
               m.preferred_contact_method::text AS "preferredContactMethod",
               GREATEST(m.max_mentees - (SELECT count(*)::int FROM mentorship s
                 WHERE s.mentor_id = m.user_id AND s.state IN ('ACCEPTED', 'ACTIVE')), 0)::int AS "spotsLeft",
               lower(p.full_name) AS "sortKey"
        FROM mentor_profile m
        JOIN profile p ON p.user_id = m.user_id
        JOIN "user" u ON u.id = m.user_id
        LEFT JOIN department d ON d.id = p.department_id
        LEFT JOIN LATERAL (
          SELECT e.company FROM profile_experience e
          WHERE e.user_id = p.user_id AND e.is_current AND ${vis.sectionVisible("experience")}
          ORDER BY e.start_date DESC, e.id LIMIT 1
        ) cur ON true
        WHERE ${Prisma.join(where, " AND ")}
        ORDER BY lower(p.full_name) ASC, p.user_id ASC
        LIMIT ${filter.limit}`;
    },
  };
}
