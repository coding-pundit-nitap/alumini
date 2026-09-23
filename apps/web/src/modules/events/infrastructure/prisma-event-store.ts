import { Prisma } from "@nitap/database";
import type { OutboxWriter } from "@nitap/database/outbox";

import type { TransactionRunner } from "@/infrastructure/database/transaction-runner";

import type { EventStore, EventTx, NewEvent } from "../application/ports";
import type { EventFacts, RegistrationState } from "../domain/event";

/**
 * The event/event_registration tables inside one transaction. Admission (E-5), seat release (E-6)
 * and cancellation are each a single guarded UPDATE — the WHERE clause is the decision, never a
 * read-then-write. Timestamps come from the database's `now()` inside the SQL, never from JS, so
 * they agree with the guard that ran in the same statement. The outbox event is written on the
 * same client, so it commits or rolls back with the row.
 */
export function createPrismaEventStore(deps: {
  runner: Pick<TransactionRunner, "run">;
  outbox: OutboxWriter;
}): EventStore {
  const forClient = (db: Prisma.TransactionClient): EventTx => ({
    async insertEvent(input: NewEvent) {
      const row = await db.event.create({
        data: {
          organizerId: input.organizerId,
          title: input.title,
          description: input.description,
          startsAt: input.startsAt,
          timezone: input.timezone,
          location: input.location,
          isOnline: input.isOnline,
          capacity: input.capacity,
          registrationDeadline: input.registrationDeadline,
        },
        select: { id: true },
      });
      return row;
    },

    async claimSeat(eventId) {
      const rows = await db.$queryRaw<{ id: string }[]>`
        UPDATE event SET registered_count = registered_count + 1, updated_at = now()
         WHERE id = ${eventId}::uuid AND status = 'SCHEDULED' AND now() < registration_deadline AND registered_count < capacity
        RETURNING id`;
      return rows.length > 0;
    },

    async upsertRegistration(eventId, userId) {
      const rows = await db.$queryRaw<{ id: string }[]>`
        INSERT INTO event_registration (id, event_id, user_id, state, registered_at, updated_at)
        VALUES (gen_random_uuid(), ${eventId}::uuid, ${userId}::uuid, 'REGISTERED', now(), now())
        ON CONFLICT (user_id, event_id) DO UPDATE SET state = 'REGISTERED', registered_at = now(), updated_at = now()
         WHERE event_registration.state = 'CANCELLED'
        RETURNING id`;
      return rows[0] ?? null;
    },

    async releaseSeat(eventId) {
      const rows = await db.$queryRaw<{ id: string }[]>`
        UPDATE event SET registered_count = registered_count - 1, updated_at = now()
         WHERE id = ${eventId}::uuid AND status = 'SCHEDULED' AND now() < starts_at
        RETURNING id`;
      return rows.length > 0;
    },

    async cancelRegistration(eventId, userId) {
      const rows = await db.$queryRaw<{ id: string }[]>`
        UPDATE event_registration SET state = 'CANCELLED', updated_at = now()
         WHERE event_id = ${eventId}::uuid AND user_id = ${userId}::uuid AND state = 'REGISTERED'
        RETURNING id`;
      return rows[0] ?? null;
    },

    async markAttendance(eventId, registrationId, state) {
      const rows = await db.$queryRaw<{ id: string; userId: string }[]>`
        UPDATE event_registration SET state = ${state}::"EventRegistrationState", updated_at = now()
         WHERE id = ${registrationId}::uuid AND event_id = ${eventId}::uuid AND state IN ('REGISTERED','ATTENDED','NO_SHOW')
        RETURNING id, user_id AS "userId"`;
      return rows[0] ?? null;
    },

    async cancelEvent(eventId) {
      const rows = await db.$queryRaw<{ id: string }[]>`
        UPDATE event SET status = 'CANCELLED', cancelled_at = now(), updated_at = now()
         WHERE id = ${eventId}::uuid AND status = 'SCHEDULED'
        RETURNING id`;
      return rows.length > 0;
    },

    async findEvent(eventId) {
      const row = await db.event.findUnique({
        where: { id: eventId },
        select: {
          status: true,
          startsAt: true,
          registrationDeadline: true,
          capacity: true,
          registeredCount: true,
          organizerId: true,
        },
      });
      return row as EventFacts | null;
    },

    async findRegistration(eventId, by) {
      const row =
        "userId" in by
          ? await db.eventRegistration.findUnique({
              where: { userId_eventId: { userId: by.userId, eventId } },
              select: { id: true, userId: true, state: true },
            })
          : await db.eventRegistration.findFirst({
              where: { id: by.registrationId, eventId },
              select: { id: true, userId: true, state: true },
            });
      return row as {
        id: string;
        userId: string;
        state: RegistrationState;
      } | null;
    },

    async enqueue(event) {
      await deps.outbox.add(db, event);
    },
  });

  return {
    transaction: (work) => deps.runner.run((db) => work(forClient(db))),
  };
}
