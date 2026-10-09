// Cache Redis down and slow, at system level.
//
// The production Redis client (@/infrastructure/redis/client: 250 ms command timeout, no offline queue)
// reaches the real cache Redis THROUGH a fault proxy. Cache Redis down is "degraded, not down":
// readiness stays 200, the unread count comes from PostgreSQL, the auth rate
// limiter falls back to its stricter in-memory twin. Only the session lookup is stubbed.
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
  const redisUrl = process.env.REDIS_URL!;
  const proxy = await startFaultProxy({ upstream: upstreamOf(redisUrl) });
  process.env.REDIS_URL = proxy.url(redisUrl);
  const name = testDatabaseName();
  const database = new URL(process.env.DATABASE_URL!);
  database.pathname = `/${name}`;
  process.env.DATABASE_URL = database.toString();
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
import { GET as unreadCount } from "@/app/api/v1/notifications/unread-count/route";
import { pool } from "@/infrastructure/database/client";
import { getRedis } from "@/infrastructure/redis/client";
import { redisRateLimitStorage } from "@/infrastructure/redis/rate-limit-storage";
import type { Actor } from "@/modules/auth";
import { resolveActor } from "@/modules/auth/application/resolve-actor";
import { createPrismaGrantSource } from "@/modules/auth/infrastructure/prisma-grant-source";

const ORIGIN = "http://localhost:3000";
const get = (path: string) => new Request(`${ORIGIN}${path}`);
const pastReadinessCache = () => new Promise((r) => setTimeout(r, 2_100));

/** ioredis reconnects by itself after an outage; resolves with the first PONG (null if none in 10 s). */
async function reconnected(): Promise<string | null> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const pong = await getRedis()
      .then((r) => r.ping())
      .catch(() => null);
    if (pong) return pong;
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

describe("cache Redis unavailable (real client through a fault proxy)", () => {
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
    await db.prisma.notification.createMany({
      data: [1, 2, 3].map((i) => ({
        recipientId: user.id,
        type: "connection.requested",
        category: "ENGAGEMENT",
        payload: {},
        dedupeKey: `fault-${i}`,
      })),
    });
    actor = await resolveActor(
      {
        grantSource: createPrismaGrantSource(db.prisma),
        now: () => new Date(),
      },
      { userId: user.id, accountState: "VERIFIED" },
      "req-redis-fault"
    );
  });

  afterAll(async () => {
    (await getRedis().catch(() => null))?.disconnect();
    await pool.end().catch(() => {});
    await setup.proxy.close();
    await db.drop();
  });

  beforeEach(() => {
    mocks.getActor.mockResolvedValue(actor);
  });

  it("down: readiness stays 200 (redis degraded), the unread count comes from PostgreSQL, and Redis is used again after recovery", async () => {
    expect((await unreadCount(get("/x"))).status).toBe(200);

    await withFault(setup.proxy, "down", async () => {
      await pastReadinessCache();
      const probe = await ready(get("/health/ready"));
      expect(probe.status).toBe(200);
      expect(await probe.json()).toMatchObject({
        status: "ok",
        checks: { postgres: "ok", redis: "degraded" },
      });

      const res = await unreadCount(get("/api/v1/notifications/unread-count"));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ data: { count: 3 } });
    });

    // No restart: the client reconnects on its own.
    expect(await reconnected()).toBe("PONG");
    await pastReadinessCache();
    expect(await (await ready(get("/health/ready"))).json()).toMatchObject({
      checks: { redis: "ok" },
    });
  }, 30_000);

  it("down: the auth rate limiter falls back to the stricter in-memory limit (half the allowance)", async () => {
    const rule = { window: 60, max: 4 };
    await withFault(setup.proxy, "down", async () => {
      const key = `fault-${Date.now()}`;
      const results = [];
      for (let i = 0; i < 4; i += 1)
        results.push((await redisRateLimitStorage.consume(key, rule)).allowed);
      expect(results).toEqual([true, true, false, false]);
    });
  });

  it("stalled: the unread count still answers fast from PostgreSQL instead of waiting on Redis", async () => {
    // Make sure the client is connected, so the stall hits an established connection.
    expect(await reconnected()).toBe("PONG");
    await withFault(setup.proxy, "stall", async () => {
      const started = Date.now();
      const res = await unreadCount(get("/api/v1/notifications/unread-count"));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ data: { count: 3 } });
      // get + seed, each bounded by the 250 ms command timeout.
      expect(Date.now() - started).toBeLessThan(1_500);
    });
  });
});
