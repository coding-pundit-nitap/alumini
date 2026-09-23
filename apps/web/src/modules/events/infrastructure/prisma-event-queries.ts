import { Prisma, type PrismaClient } from "@nitap/database";

import type {
  EventDetailRow,
  EventQueries,
  EventSummaryRow,
  Registrant,
} from "../application/event-queries";
import type { EventStatus, RegistrationState } from "../domain/event";

type Row = {
  id: string;
  title: string;
  startsAt: Date;
  timezone: string;
  location: string | null;
  isOnline: boolean;
  capacity: number;
  registeredCount: number;
  registrationDeadline: Date;
  status: EventStatus;
  organizerId: string;
  organizerName: string;
  viewerState: RegistrationState | null;
};

const toSummary = (row: Row): EventSummaryRow => ({
  id: row.id,
  title: row.title,
  startsAt: row.startsAt,
  timezone: row.timezone,
  location: row.location,
  isOnline: row.isOnline,
  capacity: row.capacity,
  registeredCount: row.registeredCount,
  registrationDeadline: row.registrationDeadline,
  status: row.status,
  organizer: { id: row.organizerId, name: row.organizerName },
  viewer: { registrationState: row.viewerState },
});

/**
 * Read side for `listEvents`/`getEvent` (spec E-10). One `SELECT` per call; admission and cancellation
 * are each a guarded write elsewhere (`prisma-event-store.ts`), never decided here.
 */
export function createPrismaEventQueries(prisma: PrismaClient): EventQueries {
  return {
    async list(viewerId, filter) {
      const where: Prisma.Sql[] = [];
      const ascending = filter.scope !== "past";

      if (filter.scope === "upcoming") {
        where.push(Prisma.sql`e.starts_at >= now()`);
      } else if (filter.scope === "past") {
        where.push(Prisma.sql`e.starts_at < now()`);
      } else {
        // mine: the caller holds a non-cancelled registration on the event, any time, oldest first.
        where.push(Prisma.sql`r.state IS NOT NULL AND r.state <> 'CANCELLED'`);
      }

      // includeCancelled=false hides cancelled EVENTS, except for "mine": the caller should still
      // see an event they registered for even after the organizer cancelled it.
      if (!filter.includeCancelled && filter.scope !== "mine") {
        where.push(Prisma.sql`e.status = 'SCHEDULED'`);
      }

      if (filter.after) {
        const key = new Date(filter.after.key);
        const cmp = ascending ? Prisma.sql`>` : Prisma.sql`<`;
        where.push(Prisma.sql`(e.starts_at ${cmp} ${key}
          OR (e.starts_at = ${key} AND e.id ${cmp} ${filter.after.id}::uuid))`);
      }

      const order = ascending
        ? Prisma.sql`e.starts_at ASC, e.id ASC`
        : Prisma.sql`e.starts_at DESC, e.id DESC`;

      const rows = await prisma.$queryRaw<Row[]>`
        SELECT e.id, e.title, e.starts_at AS "startsAt", e.timezone, e.location,
               e.is_online AS "isOnline", e.capacity, e.registered_count AS "registeredCount",
               e.registration_deadline AS "registrationDeadline", e.status,
               e.organizer_id AS "organizerId",
               COALESCE(p.full_name, u.name) AS "organizerName",
               r.state AS "viewerState"
        FROM event e
        JOIN "user" u ON u.id = e.organizer_id
        LEFT JOIN profile p ON p.user_id = e.organizer_id
        LEFT JOIN event_registration r ON r.event_id = e.id AND r.user_id = ${viewerId}::uuid
        WHERE ${Prisma.join(where, " AND ")}
        ORDER BY ${order}
        LIMIT ${filter.limit}`;

      return rows.map(toSummary);
    },

    async get(viewerId, eventId) {
      const rows = await prisma.$queryRaw<(Row & { description: string })[]>`
        SELECT e.id, e.title, e.description, e.starts_at AS "startsAt", e.timezone, e.location,
               e.is_online AS "isOnline", e.capacity, e.registered_count AS "registeredCount",
               e.registration_deadline AS "registrationDeadline", e.status,
               e.organizer_id AS "organizerId",
               COALESCE(p.full_name, u.name) AS "organizerName",
               r.state AS "viewerState"
        FROM event e
        JOIN "user" u ON u.id = e.organizer_id
        LEFT JOIN profile p ON p.user_id = e.organizer_id
        LEFT JOIN event_registration r ON r.event_id = e.id AND r.user_id = ${viewerId}::uuid
        WHERE e.id = ${eventId}::uuid`;
      const row = rows[0];
      if (!row) return null;
      const detail: EventDetailRow = {
        ...toSummary(row),
        description: row.description,
      };
      return detail;
    },

    async listRegistrants(eventId, filter) {
      const where: Prisma.Sql[] = [Prisma.sql`r.event_id = ${eventId}::uuid`];

      if (filter.after) {
        const key = new Date(filter.after.key);
        where.push(Prisma.sql`(r.registered_at > ${key}
          OR (r.registered_at = ${key} AND r.id > ${filter.after.id}::uuid))`);
      }

      const rows = await prisma.$queryRaw<
        {
          registrationId: string;
          userId: string;
          name: string;
          state: RegistrationState;
          registeredAt: Date;
        }[]
      >`
        SELECT r.id AS "registrationId", r.user_id AS "userId",
               COALESCE(p.full_name, u.name) AS "name",
               r.state, r.registered_at AS "registeredAt"
        FROM event_registration r
        JOIN "user" u ON u.id = r.user_id
        LEFT JOIN profile p ON p.user_id = r.user_id
        WHERE ${Prisma.join(where, " AND ")}
        ORDER BY r.registered_at ASC, r.id ASC
        LIMIT ${filter.limit}`;

      return rows satisfies Registrant[];
    },
  };
}
