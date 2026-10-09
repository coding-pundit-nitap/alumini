import { Prisma, type PrismaClient } from "@nitap/database";

import type { AnalyticsStore } from "../application/admin-store";
import type { AnalyticsWindow, Bucket, WeekPoint } from "../domain/analytics";

// Weeks are bucketed on the IST calendar; the domain names a week by its Monday, as here.
const WEEK = Prisma.sql`to_char(date_trunc('week', created_at AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM-DD')`;

const inWindow = (column: string, w: AnalyticsWindow) =>
  Prisma.sql`${Prisma.raw(column)} >= ${w.from}::timestamptz AND ${Prisma.raw(column)} < ${w.to}::timestamptz`;

/**
 * Only counts leave this file. Names passed to Prisma.raw are constants, never
 * input.
 */
export function createPrismaAnalyticsStore(db: PrismaClient): AnalyticsStore {
  const weekly = (table: string, w: AnalyticsWindow, extra = Prisma.empty) =>
    db.$queryRaw<WeekPoint[]>`
      SELECT ${WEEK} AS week, count(*)::int AS value
        FROM ${Prisma.raw(table)}
       WHERE ${inWindow("created_at", w)} ${extra}
       GROUP BY 1`;

  return {
    async membersSection(w) {
      const [states, signups, byRole, byGraduationYear, [decided]] =
        await Promise.all([
          db.user.groupBy({ by: ["accountState"], _count: { _all: true } }),
          weekly('"user"', w),
          db.$queryRaw<Bucket[]>`
            SELECT r.name AS key, count(DISTINCT u.id)::int AS value
              FROM "user" u
              JOIN user_role ur ON ur.user_id = u.id
              JOIN role r ON r.id = ur.role_id
             WHERE u.account_state = 'VERIFIED'
             GROUP BY r.name
             ORDER BY r.name`,
          // Alumni are the members verified through a request; their latest approved request names the year.
          db.$queryRaw<Bucket[]>`
            SELECT graduation_year::text AS key, count(*)::int AS value
              FROM (SELECT DISTINCT ON (vr.user_id) vr.graduation_year
                      FROM verification_request vr
                      JOIN "user" u ON u.id = vr.user_id
                     WHERE vr.status = 'APPROVED' AND u.account_state = 'VERIFIED'
                     ORDER BY vr.user_id, vr.reviewed_at DESC NULLS LAST) latest
             GROUP BY graduation_year
             ORDER BY graduation_year`,
          db.$queryRaw<
            {
              approved: number;
              rejected: number;
              median: number | null;
            }[]
          >`
            SELECT count(*) FILTER (WHERE status = 'APPROVED')::int AS approved,
                   count(*) FILTER (WHERE status = 'REJECTED')::int AS rejected,
                   percentile_cont(0.5) WITHIN GROUP
                     (ORDER BY extract(epoch FROM reviewed_at - created_at) / 3600) AS median
              FROM verification_request
             WHERE status <> 'PENDING' AND ${inWindow("reviewed_at", w)}`,
        ]);
      return {
        byState: Object.fromEntries(
          states.map((g) => [g.accountState, g._count._all])
        ),
        signups,
        byRole,
        byGraduationYear,
        verification: {
          approved: decided?.approved ?? 0,
          rejected: decided?.rejected ?? 0,
          medianHoursToReview: decided?.median ?? null,
        },
      };
    },

    async jobsSection(w) {
      const [submitted, byStatus, openByEmploymentType] = await Promise.all([
        weekly("job", w),
        db.$queryRaw<Bucket[]>`
          SELECT status::text AS key, count(*)::int AS value
            FROM job
           WHERE ${inWindow("created_at", w)}
           GROUP BY status
           ORDER BY status`,
        // Open = PUBLISHED and the deadline (an IST calendar date) has not passed.
        db.$queryRaw<Bucket[]>`
          SELECT employment_type::text AS key, count(*)::int AS value
            FROM job
           WHERE status = 'PUBLISHED'
             AND deadline >= (${w.to}::timestamptz AT TIME ZONE 'Asia/Kolkata')::date
           GROUP BY employment_type
           ORDER BY employment_type`,
      ]);
      return { submitted, byStatus, openByEmploymentType };
    },

    async eventsSection(w) {
      const [[events], [registrations], [upcoming]] = await Promise.all([
        db.$queryRaw<
          { held: number; cancelled: number; fill: number | null }[]
        >`
          SELECT count(*) FILTER (WHERE status = 'SCHEDULED')::int AS held,
                 count(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled,
                 avg(LEAST(registered_count::float8 / capacity, 1))
                   FILTER (WHERE status = 'SCHEDULED' AND capacity > 0) AS fill
            FROM event
           WHERE ${inWindow("starts_at", w)}`,
        db.$queryRaw<{ n: number }[]>`
          SELECT count(*)::int AS n
            FROM event_registration
           WHERE state <> 'CANCELLED' AND ${inWindow("registered_at", w)}`,
        db.$queryRaw<{ n: number }[]>`
          SELECT count(*)::int AS n
            FROM event
           WHERE status = 'SCHEDULED' AND starts_at >= ${w.to}::timestamptz`,
      ]);
      return {
        held: events?.held ?? 0,
        cancelled: events?.cancelled ?? 0,
        registrations: registrations?.n ?? 0,
        averageFillRate: events?.fill ?? null,
        upcoming: upcoming?.n ?? 0,
      };
    },

    async donationsSection(w) {
      // Confirmed money only; a pledge counts in the week it was confirmed.
      const [receivedRupees, [totals], donorsByCampaign] = await Promise.all([
        db.$queryRaw<WeekPoint[]>`
          SELECT to_char(date_trunc('week', decided_at AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM-DD') AS week,
                 round(sum(amount_paise) / 100.0)::int AS value
            FROM donation
           WHERE status = 'CONFIRMED' AND ${inWindow("decided_at", w)}
           GROUP BY 1`,
        db.$queryRaw<{ raised: bigint | null; donors: number }[]>`
          SELECT sum(amount_paise) AS raised, count(DISTINCT donor_id)::int AS donors
            FROM donation
           WHERE status = 'CONFIRMED' AND ${inWindow("decided_at", w)}`,
        db.$queryRaw<Bucket[]>`
          SELECT c.title AS key, count(DISTINCT d.donor_id)::int AS value
            FROM donation d JOIN donation_campaign c ON c.id = d.campaign_id
           WHERE d.status = 'CONFIRMED' AND ${inWindow("d.decided_at", w)}
           GROUP BY c.id, c.title
           ORDER BY c.title`,
      ]);
      return {
        receivedRupees,
        raisedPaise: Number(totals?.raised ?? 0),
        donors: totals?.donors ?? 0,
        donorsByCampaign,
      };
    },

    async communitySection(w) {
      const notDeleted = Prisma.sql`AND NOT deleted`;
      const [posts, comments, reportsByStatus] = await Promise.all([
        weekly("post", w, notDeleted),
        weekly("comment", w, notDeleted),
        db.$queryRaw<Bucket[]>`
          SELECT status::text AS key, count(*)::int AS value
            FROM report
           WHERE ${inWindow("created_at", w)}
           GROUP BY status
           ORDER BY status`,
      ]);
      return { posts, comments, reportsByStatus };
    },
  };
}
