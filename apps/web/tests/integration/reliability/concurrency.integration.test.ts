// Duplicate and concurrent requests through the real handlers, idempotency layer and production
// database client. Invariants: never over capacity, counters equal rows, one effect per operation,
// never a 500. Each racer is a distinct actor keyed by its X-Request-Id.
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const setup = vi.hoisted(() => {
  const name = `test_${crypto.randomUUID().replace(/-/g, "")}`;
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.toString();
  return { name, actors: new Map<string, unknown>() };
});

vi.mock("@/modules/auth/infrastructure/actor", async () => {
  const { getRequestContext } = await import("@/infrastructure/observability");
  return {
    getActor: async () =>
      setup.actors.get(getRequestContext()?.requestId ?? "") ?? null,
  };
});
vi.mock("@/modules/auth/infrastructure/auth", () => ({ auth: {} }));

import type { RoleName } from "@nitap/database/role-permissions";
import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { POST as requestConnection } from "@/app/api/v1/connections/route";
import { POST as register } from "@/app/api/v1/events/[id]/registrations/route";
import { POST as approveJob } from "@/app/api/v1/jobs/[id]/approve/route";
import { POST as rejectJob } from "@/app/api/v1/jobs/[id]/reject/route";
import { pool } from "@/infrastructure/database/client";
import type { Actor } from "@/modules/auth";
import { resolveActor } from "@/modules/auth/application/resolve-actor";
import { createPrismaGrantSource } from "@/modules/auth/infrastructure/prisma-grant-source";

const ORIGIN = "http://localhost:3000";
const ITERATIONS = Number(process.env.SYSTEM_RACE_ITERATIONS ?? 3);

type Outcome = { status: number; code: string | null; replayed: boolean };

/** A POST as `actor`, through the real handler; returns status and error code. */
async function as(
  actor: Actor,
  handler: (request: Request, ...rest: never[]) => Promise<Response>,
  path: string,
  options: {
    body?: unknown;
    key?: string;
    params?: Record<string, string>;
  } = {}
): Promise<Outcome> {
  const requestId = randomUUID();
  setup.actors.set(requestId, actor);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-request-id": requestId,
  };
  if (options.key) headers["idempotency-key"] = options.key;
  const request = new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(options.body ?? {}),
  });
  const response = await (
    handler as (r: Request, c: unknown) => Promise<Response>
  )(request, { params: Promise.resolve(options.params ?? {}) });
  const json = (await response.json().catch(() => null)) as {
    error?: { code: string };
  } | null;
  return {
    status: response.status,
    code: json?.error?.code ?? null,
    replayed: response.headers.get("idempotent-replay") === "true",
  };
}

/** Starts every task together: all are created before any is awaited. */
const race = <T>(tasks: Array<() => Promise<T>>) =>
  Promise.all(tasks.map((task) => task()));

/** Connection rows between two members, whichever of them asked (the pair is stored canonically). */
const pairWhere = (a: string, b: string) => ({
  OR: [
    { userAId: a, userBId: b },
    { userAId: b, userBId: a },
  ],
});

const tally = (outcomes: Outcome[]) => {
  const counts: Record<string, number> = {};
  for (const o of outcomes) {
    const key = o.status < 300 ? "ok" : (o.code ?? String(o.status));
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
};

describe("duplicate and concurrent requests through the routes (production pool)", () => {
  let db: TestDatabase;
  let seq = 0;

  beforeAll(async () => {
    db = await createTestDatabase({ name: setup.name });
    await runSeed(db.prisma);
  });

  afterAll(async () => {
    await pool.end().catch(() => {});
    await db.drop();
  });

  async function member(role: RoleName = "STUDENT"): Promise<Actor> {
    seq += 1;
    const user = await db.prisma.user.create({
      data: {
        name: `Racer ${seq}`,
        email: `racer-${seq}@example.test`,
        accountState: "VERIFIED",
      },
    });
    const roleRow = await db.prisma.role.findUniqueOrThrow({
      where: { name: role },
    });
    await db.prisma.userRole.create({
      data: { userId: user.id, roleId: roleRow.id, grantedBy: user.id },
    });
    return resolveActor(
      {
        grantSource: createPrismaGrantSource(db.prisma),
        now: () => new Date(),
      },
      { userId: user.id, accountState: "VERIFIED" },
      "req-race"
    );
  }

  describe("duplicate requests", () => {
    it("five simultaneous POST /connections with one Idempotency-Key, then a replay: one connection, one event, no 500", async () => {
      const [a, b] = await Promise.all([member(), member()]);
      const key = randomUUID();
      const send = () =>
        as(a, requestConnection, "/api/v1/connections", {
          body: { recipientId: b.userId },
          key,
        });

      const outcomes = await race(Array.from({ length: 5 }, () => send));
      const replay = await send();

      for (const o of [...outcomes, replay])
        expect([201, 409]).toContain(o.status);
      // Concurrent duplicates either replay the stored response or are told the first is still running.
      for (const o of outcomes.filter((o) => o.status === 409))
        expect(o.code).toBe("REQUEST_IN_PROGRESS");
      expect(
        outcomes.filter((o) => o.status === 201 && !o.replayed)
      ).toHaveLength(1);
      expect(replay).toMatchObject({ status: 201, replayed: true });

      expect(
        await db.prisma.connection.count({
          where: pairWhere(a.userId, b.userId),
        })
      ).toBe(1);
      expect(
        await db.prisma.outboxEvent.count({
          where: {
            type: "connection.requested",
            payload: { path: ["actorId"], equals: a.userId },
          },
        })
      ).toBe(1);
    });

    it("a double-submit without a key: one connection, the other answers CONNECTION_EXISTS", async () => {
      const [a, b] = await Promise.all([member(), member()]);
      const send = () =>
        as(a, requestConnection, "/api/v1/connections", {
          body: { recipientId: b.userId },
        });
      const outcomes = await race([send, send]);
      expect(tally(outcomes)).toEqual({ ok: 1, CONNECTION_EXISTS: 1 });
      expect(
        await db.prisma.connection.count({
          where: pairWhere(a.userId, b.userId),
        })
      ).toBe(1);
    });
  });

  describe("concurrent requests", () => {
    it.each(Array.from({ length: ITERATIONS }, (_, i) => i + 1))(
      "event capacity 10, 30 members at once: never over capacity, count = rows, refusals are EVENT_FULL or 503 (run %i)",
      async () => {
        const organizer = await member();
        const day = 86_400_000;
        const event = await db.prisma.event.create({
          data: {
            organizerId: organizer.userId,
            title: "Race",
            description: "system race",
            startsAt: new Date(Date.now() + 7 * day),
            registrationDeadline: new Date(Date.now() + 6 * day),
            timezone: "UTC",
            isOnline: true,
            capacity: 10,
          },
        });
        const members = await Promise.all(
          Array.from({ length: 30 }, () => member())
        );

        const outcomes = await race(
          members.map(
            (m) => () =>
              as(m, register, `/api/v1/events/${event.id}/registrations`, {
                params: { id: event.id },
              })
          )
        );

        const counts = tally(outcomes);
        expect(
          Object.keys(counts).every((k) =>
            ["ok", "EVENT_FULL", "SERVICE_UNAVAILABLE"].includes(k)
          )
        ).toBe(true);
        const { registeredCount } = await db.prisma.event.findUniqueOrThrow({
          where: { id: event.id },
        });
        const rows = await db.prisma.eventRegistration.count({
          where: { eventId: event.id, state: "REGISTERED" },
        });
        expect(registeredCount).toBe(rows);
        expect(rows).toBe(counts.ok ?? 0);
        expect(rows).toBeLessThanOrEqual(10);
        // Nothing needlessly refused: unless the pool turned some away, the event fills exactly.
        if (!counts.SERVICE_UNAVAILABLE) expect(rows).toBe(10);
      },
      60_000
    );

    it.each(Array.from({ length: ITERATIONS }, (_, i) => i + 1))(
      "A→B and B→A plus duplicates at once: exactly one connection row (run %i)",
      async () => {
        const [a, b] = await Promise.all([member(), member()]);
        const ab = () =>
          as(a, requestConnection, "/api/v1/connections", {
            body: { recipientId: b.userId },
          });
        const ba = () =>
          as(b, requestConnection, "/api/v1/connections", {
            body: { recipientId: a.userId },
          });
        const outcomes = await race([
          ab,
          ba,
          ab,
          ba,
          ab,
          ba,
          ab,
          ba,
          ab,
          ba,
          ab,
          ba,
        ]);

        expect(tally(outcomes)).toEqual({ ok: 1, CONNECTION_EXISTS: 11 });
        expect(
          await db.prisma.connection.count({
            where: pairWhere(a.userId, b.userId),
          })
        ).toBe(1);
      },
      30_000
    );

    it.each(Array.from({ length: ITERATIONS }, (_, i) => i + 1))(
      "two admins approve and reject one pending job at once: exactly one decision and one audit row (run %i)",
      async () => {
        const [poster, first, second] = await Promise.all([
          member("ALUMNI"),
          member("TP_ADMIN"),
          member("TP_ADMIN"),
        ]);
        const job = await db.prisma.job.create({
          data: {
            postedBy: poster.userId,
            title: "Engineer",
            company: "Acme",
            description: "Build things",
            employmentType: "FULL_TIME",
            location: "Itanagar",
            workMode: "ONSITE",
            experience: "0-2 years",
            applicationUrl: "https://acme.example/jobs/1",
            deadline: new Date(Date.now() + 30 * 86_400_000),
          },
        });
        const path = `/api/v1/jobs/${job.id}`;
        const outcomes = await race([
          () =>
            as(first, approveJob, `${path}/approve`, {
              params: { id: job.id },
            }),
          () =>
            as(second, rejectJob, `${path}/reject`, {
              params: { id: job.id },
              body: { reviewNote: "Not a fit for the board." },
            }),
        ]);

        expect(tally(outcomes)).toEqual({ ok: 1, INVALID_STATE_TRANSITION: 1 });
        const decided = await db.prisma.job.findUniqueOrThrow({
          where: { id: job.id },
        });
        expect(["PUBLISHED", "REJECTED"]).toContain(decided.status);
        expect(
          await db.prisma.auditLog.count({ where: { targetId: job.id } })
        ).toBe(1);
      },
      30_000
    );
  });
});
