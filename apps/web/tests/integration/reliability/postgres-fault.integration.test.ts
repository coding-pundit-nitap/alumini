// PostgreSQL down and slow, at system level.
//
// The production database client (@/infrastructure/database/client: its pool cap, acquire timeout and
// query timeouts) talks to a per-file test database THROUGH a fault proxy; DATABASE_URL is pointed at the
// proxy before anything imports the client. Route Handlers, the readiness probe and the use cases are real.
// Only the session lookup is stubbed.
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const setup = await vi.hoisted(async () => {
  const { startFaultProxy, testDatabaseName, upstreamOf } =
    await import("@nitap/testing");
  const base = process.env.DATABASE_URL!;
  const proxy = await startFaultProxy({ upstream: upstreamOf(base) });
  const name = testDatabaseName();
  const url = new URL(proxy.url(base));
  url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.toString();
  return { proxy, name };
});

const mocks = vi.hoisted(() => ({ getActor: vi.fn() }));
vi.mock("@/modules/auth/infrastructure/actor", () => ({
  getActor: mocks.getActor,
}));
vi.mock("@/modules/auth/infrastructure/auth", () => ({ auth: {} }));

import { runSeed } from "@nitap/database/seed";
import {
  createTestDatabase,
  withFault,
  type TestDatabase,
} from "@nitap/testing";

import { GET as ready } from "@/app/health/ready/route";
import { GET as listNotifications } from "@/app/api/v1/notifications/route";
import { pool } from "@/infrastructure/database/client";
import type { Actor } from "@/modules/auth";
import { resolveActor } from "@/modules/auth/application/resolve-actor";
import { createPrismaGrantSource } from "@/modules/auth/infrastructure/prisma-grant-source";

const ORIGIN = "http://localhost:3000";
const get = (path: string) => new Request(`${ORIGIN}${path}`);
// Readiness caches each check for 2 s; wait it out between states.
const pastReadinessCache = () => new Promise((r) => setTimeout(r, 2_100));

async function eventually<T>(
  fn: () => Promise<T>,
  accept: (value: T) => boolean,
  timeoutMs = 10_000
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (accept(value) || Date.now() > deadline) return value;
    await new Promise((r) => setTimeout(r, 200));
  }
}

describe("PostgreSQL unavailable (real pool through a fault proxy)", () => {
  let db: TestDatabase;
  let actor: Actor;

  beforeAll(async () => {
    db = await createTestDatabase({ name: setup.name });
    await runSeed(db.prisma);
    const user = await db.prisma.user.create({
      data: { name: "M", email: "m@example.test", accountState: "VERIFIED" },
    });
    const student = await db.prisma.role.findUniqueOrThrow({
      where: { name: "STUDENT" },
    });
    await db.prisma.userRole.create({
      data: { userId: user.id, roleId: student.id, grantedBy: user.id },
    });
    actor = await resolveActor(
      {
        grantSource: createPrismaGrantSource(db.prisma),
        now: () => new Date(),
      },
      { userId: user.id, accountState: "VERIFIED" },
      "req-postgres-fault"
    );
  });

  afterAll(async () => {
    await pool.end().catch(() => {});
    await setup.proxy.close();
    await db.drop();
  });

  beforeEach(() => {
    mocks.getActor.mockResolvedValue(actor);
  });

  it("refused: readiness 503, the API answers 503 SERVICE_UNAVAILABLE with Retry-After and no internals; recovers without a restart", async () => {
    expect((await listNotifications(get("/api/v1/notifications"))).status).toBe(
      200
    );

    await withFault(setup.proxy, "down", async () => {
      await pastReadinessCache();
      const probe = await ready(get("/health/ready"));
      expect(probe.status).toBe(503);
      expect(await probe.json()).toMatchObject({
        status: "unavailable",
        checks: { postgres: "down" },
      });

      const started = Date.now();
      const res = await listNotifications(get("/api/v1/notifications"));
      expect(Date.now() - started).toBeLessThan(3_000);
      expect(res.status).toBe(503);
      expect(res.headers.get("retry-after")).toBe("5");
      expect(res.headers.get("x-request-id")).toBeTruthy();
      const text = await res.text();
      expect(JSON.parse(text)).toMatchObject({
        error: { code: "SERVICE_UNAVAILABLE" },
      });
      // No driver message, host, port or stack reaches the client.
      expect(text).not.toMatch(/P1001|127\.0\.0\.1|ECONN|at \w+ \(/);
    });

    await pastReadinessCache();
    expect((await ready(get("/health/ready"))).status).toBe(200);
    const after = await eventually(
      () => listNotifications(get("/api/v1/notifications")),
      (r) => r.status === 200
    );
    expect(after.status).toBe(200);
  });

  it("stalled (slow, not dead): each request fails fast with 503 instead of hanging, and the pool is not exhausted afterwards", async () => {
    // Warm the pool so the stall hits established connections, not only new ones.
    await Promise.all(
      Array.from({ length: 5 }, () =>
        listNotifications(get("/api/v1/notifications"))
      )
    );

    await withFault(setup.proxy, "stall", async () => {
      // More requests than the pool has connections (max 10).
      const started = Date.now();
      const responses = await Promise.all(
        Array.from({ length: 12 }, () =>
          listNotifications(get("/api/v1/notifications"))
        )
      );
      const elapsed = Date.now() - started;
      expect(responses.map((r) => r.status)).toEqual(Array(12).fill(503));
      // The client-side bounds (2 s acquire, query timeout) end every request; nothing waits on TCP.
      expect(elapsed).toBeLessThan(15_000);
    });

    const after = await eventually(
      () => listNotifications(get("/api/v1/notifications")),
      (r) => r.status === 200
    );
    expect(after.status).toBe(200);
    // Every connection came back: a burst the size of the pool succeeds.
    const burst = await Promise.all(
      Array.from({ length: 10 }, () =>
        listNotifications(get("/api/v1/notifications"))
      )
    );
    expect(burst.map((r) => r.status)).toEqual(Array(10).fill(200));
  }, 40_000);
});
