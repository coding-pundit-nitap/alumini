import { randomUUID } from "node:crypto";

import { afterEach } from "vitest";

import { createOutboxWriter } from "@nitap/database/outbox";
import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createTransactionRunner } from "@/infrastructure/database/transaction-runner";
import { createPrismaEventStore } from "@/modules/events/infrastructure/prisma-event-store";

import {
  describeEventStoreContract,
  type EventSeed,
  type EventStoreHarness,
} from "../../support/event-store.contract";

/** The contract harness backed by real PostgreSQL. Seeds insert directly so tests can set any state. */
function buildHarness(db: TestDatabase): EventStoreHarness {
  const store = createPrismaEventStore({
    runner: createTransactionRunner(db.prisma),
    outbox: createOutboxWriter(),
  });

  return {
    store,
    async seedUser() {
      const user = await db.prisma.user.create({
        data: {
          name: `user-${randomUUID()}`,
          email: `${randomUUID()}@example.test`,
          accountState: "VERIFIED",
        },
      });
      return user.id;
    },
    async seedEvent(seed: EventSeed) {
      const event = await db.prisma.event.create({
        data: {
          organizerId: seed.organizerId,
          title: "Seeded event",
          description: "Seeded for the contract suite",
          startsAt: seed.startsAt,
          timezone: "UTC",
          location: null,
          isOnline: true,
          capacity: seed.capacity,
          registeredCount: seed.registeredCount ?? 0,
          registrationDeadline: seed.registrationDeadline,
          status: seed.status ?? "SCHEDULED",
          cancelledAt: seed.status === "CANCELLED" ? new Date() : null,
        },
      });
      return event.id;
    },
    async seedRegistration(eventId, userId, state) {
      const registration = await db.prisma.eventRegistration.create({
        data: { eventId, userId, state },
      });
      return registration.id;
    },
    async outboxTypes() {
      const rows = await db.prisma.outboxEvent.findMany({
        where: { type: { startsWith: "event." } },
        select: { type: true },
      });
      return rows.map((r) => r.type);
    },
  };
}

let db: TestDatabase | undefined;
afterEach(async () => {
  await db?.drop();
  db = undefined;
});

describeEventStoreContract("prisma store", async () => {
  db = await createTestDatabase();
  await runSeed(db.prisma);
  return buildHarness(db);
});
