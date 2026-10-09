import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createIdempotencyStore } from "@nitap/database/idempotency";
import { createOutboxWriter } from "@nitap/database/outbox";
import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createTransactionRunner } from "@/infrastructure/database/transaction-runner";
import { createIdempotency } from "@/infrastructure/idempotency/idempotency";
import { AuthenticationError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";
import { createRegisterForEvent } from "@/modules/events/application/register-for-event";
import { createPrismaEventStore } from "@/modules/events/infrastructure/prisma-event-store";

const KEY = "22222222-2222-4222-8222-222222222222";

/**
 * Route-level shape POST /api/v1/events/:id/registrations returns (see that
 * route.ts).
 */
type Response = {
  status: number;
  body: { data: { registrationId: string } };
  headers: Record<string, string>;
};

describe("idempotent POST /api/v1/events/:id/registrations (real PostgreSQL)", () => {
  let db: TestDatabase;
  let userId: string;
  let eventId: string;
  const idempotencyStore = createIdempotencyStore();

  const port = () => ({
    claim: (i: { userId: string; key: string; requestHash: string }) =>
      idempotencyStore.claim(db.prisma, i),
    find: (u: string, k: string) => idempotencyStore.find(db.prisma, u, k),
    complete: (u: string, k: string, r: Response) =>
      idempotencyStore.complete(db.prisma, u, k, r),
    release: (u: string, k: string) =>
      idempotencyStore.release(db.prisma, u, k),
    reclaim: (u: string, k: string, b: Date) =>
      idempotencyStore.reclaim(db.prisma, u, k, b),
  });

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    const organizer = await db.prisma.user.create({
      data: {
        name: "Org",
        email: "org@example.test",
        accountState: "VERIFIED",
      },
    });
    userId = (
      await db.prisma.user.create({
        data: { name: "A", email: "a@example.test", accountState: "VERIFIED" },
      })
    ).id;
    const day = 24 * 60 * 60 * 1000;
    eventId = (
      await db.prisma.event.create({
        data: {
          organizerId: organizer.id,
          title: "Reunion",
          description: "The annual alumni reunion.",
          startsAt: new Date(Date.now() + 7 * day),
          registrationDeadline: new Date(Date.now() + 6 * day),
          timezone: "UTC",
          isOnline: true,
          capacity: 1,
        },
        select: { id: true },
      })
    ).id;
  });

  afterEach(async () => {
    await db.drop();
  });

  it("a replayed POST returns the same body and only one seat is taken", async () => {
    const register = createRegisterForEvent({
      store: createPrismaEventStore({
        runner: createTransactionRunner(db.prisma),
        outbox: createOutboxWriter(),
      }),
      authorize: (a: Actor | null) => {
        if (!a) throw new AuthenticationError();
        return a;
      },
    });
    const actor: Actor = {
      userId,
      accountState: "VERIFIED",
      requestId: "r",
      grants: [],
    };
    const run = createIdempotency({ port: port() });
    let executions = 0;
    const call = () =>
      run({
        userId,
        key: KEY,
        requestHash: "same",
        execute: async (): Promise<Response> => {
          executions += 1;
          const { registrationId } = await register({ actor, eventId });
          return {
            status: 201,
            body: { data: { registrationId } },
            headers: {},
          };
        },
      });

    const first = await call();
    const second = await call();

    expect(executions).toBe(1);
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.response.body).toEqual(first.response.body);

    const state = await db.prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      select: { registeredCount: true },
    });
    expect(state.registeredCount).toBe(1);
    expect(
      await db.prisma.eventRegistration.count({
        where: { eventId, userId, state: "REGISTERED" },
      })
    ).toBe(1);
  });
});
