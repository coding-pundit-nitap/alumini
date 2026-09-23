// Route-level, real PostgreSQL, real authorize; only the session (getActor) and Redis are doubled.
// Same construction as tests/integration/api/posts.integration.test.ts.
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

const mocks = vi.hoisted(() => ({
  dbRef: { current: null as TestDatabase | null },
  getActor: vi.fn(),
  getRedis: vi.fn(),
}));

vi.mock("@/infrastructure/database/client", () => {
  const client = () => {
    if (!mocks.dbRef.current) throw new Error("test database not ready");
    return mocks.dbRef.current.prisma;
  };
  return {
    prisma: new Proxy(
      {},
      {
        get(_target, prop) {
          const value = (client() as unknown as Record<PropertyKey, unknown>)[
            prop
          ];
          return typeof value === "function" ? value.bind(client()) : value;
        },
      }
    ),
    transactionRunner: {
      run: (fn: (tx: unknown) => Promise<unknown>) => client().$transaction(fn),
    },
  };
});
vi.mock("@/modules/auth/infrastructure/actor", () => ({
  getActor: mocks.getActor,
}));
vi.mock("@/modules/auth/infrastructure/auth", () => ({ auth: {} }));
vi.mock("@/infrastructure/redis/client", () => ({
  getRedis: mocks.getRedis,
}));

import type { Actor } from "@/modules/auth";
import { resolveActor } from "@/modules/auth/application/resolve-actor";
import { createPrismaGrantSource } from "@/modules/auth/infrastructure/prisma-grant-source";

import { GET as listRoute } from "@/app/api/v1/notifications/route";

const ORIGIN = "https://alumni.example.test";
const req = (path: string, init?: RequestInit) =>
  new Request(`${ORIGIN}${path}`, init);

/** Minimal in-memory stand-in for the ioredis calls the web counter makes. */
function fakeRedis() {
  const data = new Map<string, string>();
  return {
    data,
    get: async (k: string) => data.get(k) ?? null,
    set: async (k: string, v: string) => {
      if (data.has(k)) return null;
      data.set(k, v);
      return "OK";
    },
    decrby: async (k: string, by: number) => {
      const n = Number(data.get(k) ?? 0) - by;
      data.set(k, String(n));
      return n;
    },
    del: async (k: string) => data.delete(k),
  };
}
const redisDown = () => {
  mocks.getRedis.mockRejectedValue(new Error("ECONNREFUSED"));
};

describe("notifications API security", () => {
  let db: TestDatabase;
  let grantorId: string;
  let n = 0;
  let redis: ReturnType<typeof fakeRedis>;

  beforeAll(async () => {
    db = await createTestDatabase();
    mocks.dbRef.current = db;
    await runSeed(db.prisma);
    grantorId = (
      await db.prisma.user.create({
        data: {
          name: "Grantor",
          email: "grantor@example.test",
          accountState: "VERIFIED",
        },
      })
    ).id;
  });
  afterAll(async () => {
    await db.drop();
  });
  beforeEach(async () => {
    vi.clearAllMocks();
    redis = fakeRedis();
    mocks.getRedis.mockResolvedValue(redis);
    await db.prisma.notification.deleteMany();
    await db.prisma.notificationPreference.deleteMany();
  });

  async function member(): Promise<Actor> {
    n += 1;
    const user = await db.prisma.user.create({
      data: {
        name: `M${n}`,
        email: `m${n}@example.test`,
        accountState: "VERIFIED",
      },
    });
    const role = await db.prisma.role.findUniqueOrThrow({
      where: { name: "STUDENT" },
    });
    await db.prisma.userRole.create({
      data: { userId: user.id, roleId: role.id, grantedBy: grantorId },
    });
    return resolveActor(
      {
        grantSource: createPrismaGrantSource(db.prisma),
        now: () => new Date(),
      },
      { userId: user.id, accountState: "VERIFIED" },
      "req-notifications-security"
    );
  }
  const as = (actor: Actor | null) => mocks.getActor.mockResolvedValue(actor);
  let seq = 0;
  const notify = async (recipientId: string, read = false) =>
    (
      await db.prisma.notification.create({
        data: {
          recipientId,
          type: "connection.requested",
          category: "ENGAGEMENT",
          payload: {},
          dedupeKey: `k${(seq += 1)}`,
          readAt: read ? new Date() : null,
        },
      })
    ).id;

  describe("GET /api/v1/notifications", () => {
    it("401s a signed-out caller", async () => {
      as(null);
      expect((await listRoute(req("/api/v1/notifications"))).status).toBe(401);
    });

    it("only ever lists the caller's own notifications (IDOR)", async () => {
      const a = await member();
      const b = await member();
      const mine = await notify(a.userId);
      await notify(b.userId);
      as(a);
      const res = await listRoute(req("/api/v1/notifications"));
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { id: string }[] };
      expect(body.data.map((r) => r.id)).toEqual([mine]);
    });

    it("pages by opaque cursor, bounds the limit and 400s a malformed cursor", async () => {
      const a = await member();
      for (let i = 0; i < 3; i += 1) await notify(a.userId);
      as(a);
      const first = (await (
        await listRoute(req("/api/v1/notifications?limit=2"))
      ).json()) as {
        data: { id: string }[];
        page: { nextCursor: string | null };
      };
      expect(first.data).toHaveLength(2);
      const second = (await (
        await listRoute(
          req(
            `/api/v1/notifications?limit=2&cursor=${encodeURIComponent(first.page.nextCursor!)}`
          )
        )
      ).json()) as { data: { id: string }[] };
      expect(second.data).toHaveLength(1);
      expect(
        (await listRoute(req("/api/v1/notifications?cursor=%25%25"))).status
      ).toBe(400);
      expect(
        (await listRoute(req("/api/v1/notifications?limit=1000"))).status
      ).toBe(400);
    });

    it("still returns 200 when Redis is down (list never touches it)", async () => {
      const a = await member();
      await notify(a.userId);
      redisDown();
      as(a);
      expect((await listRoute(req("/api/v1/notifications"))).status).toBe(200);
    });
  });
});
