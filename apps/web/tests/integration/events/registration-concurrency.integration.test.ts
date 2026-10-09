import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "@nitap/database";
import { createOutboxWriter } from "@nitap/database/outbox";
import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";
import { PrismaPg } from "@prisma/adapter-pg";

import { createTransactionRunner } from "@/infrastructure/database/transaction-runner";
import { AppError, AuthenticationError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";
import { createCancelRegistration } from "@/modules/events/application/cancel-registration";
import { createRegisterForEvent } from "@/modules/events/application/register-for-event";
import { createPrismaEventStore } from "@/modules/events/infrastructure/prisma-event-store";

import { createNaiveEventStore } from "./naive-event-store";

/** The guarded updates never oversell or lose an increment; the naive store does. */
const ITER = Number(process.env.EVENT_RACE_ITERATIONS ?? 3);
const RACE_TIMEOUT = 180_000;

const actor = (userId: string): Actor => ({
  userId,
  accountState: "VERIFIED",
  requestId: "r",
  grants: [],
});
const authorize = (a: Actor | null) => {
  if (!a) throw new AuthenticationError();
  return a;
};

/** "ok" for a fulfilled call, the AppError code for a refusal, otherwise the raw error (a test failure). */
const outcome = (r: PromiseSettledResult<unknown>) =>
  r.status === "fulfilled"
    ? "ok"
    : r.reason instanceof AppError
      ? r.reason.code
      : r.reason;
const tally = (results: PromiseSettledResult<unknown>[]) => {
  const counts: Record<string, number> = {};
  for (const r of results) {
    const key = outcome(r);
    if (typeof key !== "string") throw key;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
};

describe("event registration under concurrency (real PostgreSQL)", () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let runner: ReturnType<typeof createTransactionRunner>;
  let register: ReturnType<typeof createRegisterForEvent>;
  let cancel: ReturnType<typeof createCancelRegistration>;
  let organizerId: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    // A wider pool than production's so 200 racers genuinely overlap; long waits so queueing
    // for a connection is never mistaken for a failure.
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: db.databaseUrl, max: 40 }),
    });
    runner = createTransactionRunner(prisma, {
      maxWaitMs: 60_000,
      timeoutMs: 30_000,
    });
    const store = createPrismaEventStore({
      runner,
      outbox: createOutboxWriter(),
    });
    register = createRegisterForEvent({ store, authorize });
    cancel = createCancelRegistration({ store, authorize });
    organizerId = (await seedUsers(1))[0]!;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.drop();
  });

  let userSeq = 0;
  async function seedUsers(n: number): Promise<string[]> {
    const rows = await db.prisma.user.createManyAndReturn({
      data: Array.from({ length: n }, () => {
        userSeq += 1;
        return {
          name: `racer-${userSeq}`,
          email: `racer-${userSeq}@example.test`,
          accountState: "VERIFIED" as const,
        };
      }),
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  async function seedEvent(capacity: number, registeredCount = 0) {
    const day = 24 * 60 * 60 * 1000;
    const event = await db.prisma.event.create({
      data: {
        organizerId,
        title: "Race event",
        description: "Seeded for the concurrency suite",
        startsAt: new Date(Date.now() + 7 * day),
        registrationDeadline: new Date(Date.now() + 6 * day),
        timezone: "UTC",
        isOnline: true,
        capacity,
        registeredCount,
      },
      select: { id: true },
    });
    return event.id;
  }

  async function state(eventId: string) {
    const event = await db.prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      select: { registeredCount: true, capacity: true },
    });
    const rows = await db.prisma.eventRegistration.count({
      where: { eventId, state: "REGISTERED" },
    });
    return { count: event.registeredCount, capacity: event.capacity, rows };
  }

  it(
    "admits exactly capacity (100) of 200 simultaneous registrants",
    async () => {
      for (let i = 0; i < ITER; i++) {
        const eventId = await seedEvent(100);
        const members = await seedUsers(200);

        const results = await Promise.allSettled(
          members.map((m) => register({ actor: actor(m), eventId }))
        );

        expect(tally(results)).toEqual({ ok: 100, EVENT_FULL: 100 });
        expect(await state(eventId)).toEqual({
          count: 100,
          capacity: 100,
          rows: 100,
        });
      }
    },
    RACE_TIMEOUT
  );

  it(
    "negative control: a read-then-write store oversells or loses increments in the same race",
    async () => {
      const naive = createNaiveEventStore(runner);
      for (let i = 0; i < ITER; i++) {
        let caught = false;
        for (let attempt = 0; attempt < 5 && !caught; attempt++) {
          const eventId = await seedEvent(100);
          const members = await seedUsers(200);

          const results = await Promise.allSettled(
            members.map((m) => naive.register(eventId, m))
          );
          tally(results); // rethrows anything unexpected

          const { count, capacity, rows } = await state(eventId);
          caught = rows > capacity || count !== rows;
        }
        expect(caught).toBe(true);
      }
    },
    RACE_TIMEOUT
  );

  it(
    "one user racing 20 registrations gets exactly one seat",
    async () => {
      for (let i = 0; i < ITER; i++) {
        const eventId = await seedEvent(100);
        const [member] = await seedUsers(1);

        const results = await Promise.allSettled(
          Array.from({ length: 20 }, () =>
            register({ actor: actor(member!), eventId })
          )
        );

        expect(tally(results)).toEqual({ ok: 1, ALREADY_REGISTERED: 19 });
        expect(await state(eventId)).toEqual({
          count: 1,
          capacity: 100,
          rows: 1,
        });
      }
    },
    RACE_TIMEOUT
  );

  it(
    "a full event: 10 cancellations racing 20 newcomers hand exactly 10 seats over",
    async () => {
      for (let i = 0; i < ITER; i++) {
        const eventId = await seedEvent(50, 50);
        const registrants = await seedUsers(50);
        await db.prisma.eventRegistration.createMany({
          data: registrants.map((userId) => ({
            eventId,
            userId,
            state: "REGISTERED" as const,
          })),
        });
        const newcomers = await seedUsers(20);

        // Retry EVENT_FULL until all cancellations have committed, so exactly 10 newcomers win.
        let cancelsSettled = false;
        const cancellations = Promise.allSettled(
          registrants
            .slice(0, 10)
            .map((m) => cancel({ actor: actor(m), eventId }))
        ).then((r) => {
          cancelsSettled = true;
          return r;
        });
        const newcomer = async (m: string) => {
          for (;;) {
            const final = cancelsSettled;
            try {
              return await register({ actor: actor(m), eventId });
            } catch (error) {
              const full =
                error instanceof AppError && error.code === "EVENT_FULL";
              if (!full || final) throw error;
              await new Promise((r) => setTimeout(r, 5));
            }
          }
        };
        const [cancelResults, newcomerResults] = await Promise.all([
          cancellations,
          Promise.allSettled(newcomers.map(newcomer)),
        ]);

        expect(tally(cancelResults)).toEqual({ ok: 10 });
        expect(tally(newcomerResults)).toEqual({ ok: 10, EVENT_FULL: 10 });
        expect(await state(eventId)).toEqual({
          count: 50,
          capacity: 50,
          rows: 50,
        });
      }
    },
    RACE_TIMEOUT
  );

  it(
    "one user alternating register/cancel 50x in parallel leaves count equal to rows",
    async () => {
      for (let i = 0; i < ITER; i++) {
        const eventId = await seedEvent(100);
        const [member] = await seedUsers(1);

        const results = await Promise.allSettled(
          Array.from({ length: 50 }, (_, n) =>
            n % 2 === 0
              ? register({ actor: actor(member!), eventId })
              : cancel({ actor: actor(member!), eventId })
          )
        );

        // tally rethrows any non-AppError. INVALID_STATE_TRANSITION is legitimate when a cancel races a register.
        const counts = tally(results);
        const allowed = new Set([
          "ok",
          "ALREADY_REGISTERED",
          "NOT_FOUND",
          "INVALID_STATE_TRANSITION",
        ]);
        expect(Object.keys(counts).filter((k) => !allowed.has(k))).toEqual([]);
        const { count, rows } = await state(eventId);
        expect(count).toBe(rows);
        expect(rows).toBeLessThanOrEqual(1);
      }
    },
    RACE_TIMEOUT
  );
});
