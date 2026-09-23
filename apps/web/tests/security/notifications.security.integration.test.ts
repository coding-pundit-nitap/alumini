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
import { GET as unreadRoute } from "@/app/api/v1/notifications/unread-count/route";
import {
  GET as prefsGet,
  PATCH as prefsPatch,
} from "@/app/api/v1/notifications/preferences/route";
import { POST as readAllRoute } from "@/app/api/v1/notifications/read-all/route";
import { POST as readRoute } from "@/app/api/v1/notifications/[id]/read/route";

const ORIGIN = "https://alumni.example.test";
const req = (path: string, init?: RequestInit) =>
  new Request(`${ORIGIN}${path}`, init);
const post = (path: string) =>
  req(path, { method: "POST", headers: { origin: ORIGIN } });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

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
  describe("mark read", () => {
    const readAt = async (id: string) =>
      (await db.prisma.notification.findUniqueOrThrow({ where: { id } }))
        .readAt;

    it("401s a signed-out caller", async () => {
      as(null);
      const id = await notify((await member()).userId);
      expect((await readRoute(post(`/x`), ctx(id))).status).toBe(401);
      expect((await readAllRoute(post(`/x`))).status).toBe(401);
    });

    it("403s a cross-origin mutation", async () => {
      const a = await member();
      as(a);
      const id = await notify(a.userId);
      const res = await readRoute(
        req("/x", { method: "POST", headers: { origin: "https://evil.test" } }),
        ctx(id)
      );
      expect(res.status).toBe(403);
      expect(await readAt(id)).toBeNull();
    });

    it("404s (no leak) and changes nothing for another member's notification (IDOR)", async () => {
      const a = await member();
      const b = await member();
      const theirs = await notify(b.userId);
      redis.data.set(`notif:unread:${b.userId}`, "1");
      as(a);
      expect((await readRoute(post("/x"), ctx(theirs))).status).toBe(404);
      expect(await readAt(theirs)).toBeNull();
      expect(redis.data.get(`notif:unread:${b.userId}`)).toBe("1");
      // an unknown / malformed id is indistinguishable
      expect((await readRoute(post("/x"), ctx("nope"))).status).toBe(404);
    });

    it("marks read, decrements the counter once, and a repeat is a 204 no-op", async () => {
      const a = await member();
      as(a);
      const id = await notify(a.userId);
      await notify(a.userId);
      redis.data.set(`notif:unread:${a.userId}`, "2");
      expect((await readRoute(post("/x"), ctx(id))).status).toBe(204);
      expect((await readRoute(post("/x"), ctx(id))).status).toBe(204);
      expect(await readAt(id)).not.toBeNull();
      expect(redis.data.get(`notif:unread:${a.userId}`)).toBe("1");
    });

    it("still marks read when Redis is down", async () => {
      const a = await member();
      as(a);
      const id = await notify(a.userId);
      redisDown();
      expect((await readRoute(post("/x"), ctx(id))).status).toBe(204);
      expect(await readAt(id)).not.toBeNull();
    });

    it("mark-all-read only touches the caller's rows and decrements by the flipped count", async () => {
      const a = await member();
      const b = await member();
      await notify(a.userId);
      await notify(a.userId);
      await notify(a.userId, true);
      const theirs = await notify(b.userId);
      redis.data.set(`notif:unread:${a.userId}`, "2");
      as(a);
      const res = await readAllRoute(post("/x"));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ data: { updated: 2 } });
      expect(await readAt(theirs)).toBeNull();
      expect(redis.data.get(`notif:unread:${a.userId}`)).toBe("0");
    });
  });
  describe("GET /api/v1/notifications/unread-count", () => {
    const count = async () =>
      (
        (await (await unreadRoute(req("/x"))).json()) as {
          data: { count: number };
        }
      ).data.count;

    it("401s a signed-out caller", async () => {
      as(null);
      expect((await unreadRoute(req("/x"))).status).toBe(401);
    });

    it("recomputes from Postgres when the key is missing, then seeds Redis", async () => {
      const a = await member();
      await notify(a.userId);
      await notify(a.userId);
      await notify(a.userId, true);
      await notify((await member()).userId);
      as(a);
      expect(await count()).toBe(2);
      expect(redis.data.get(`notif:unread:${a.userId}`)).toBe("2");
    });

    it("serves the Redis value when present", async () => {
      const a = await member();
      await notify(a.userId);
      redis.data.set(`notif:unread:${a.userId}`, "7");
      as(a);
      expect(await count()).toBe(7);
    });

    it("recomputes when the Redis value has drifted negative", async () => {
      const a = await member();
      await notify(a.userId);
      redis.data.set(`notif:unread:${a.userId}`, "-3");
      as(a);
      expect(await count()).toBe(1);
    });

    it("returns 200 with the Postgres count when Redis is down (never 503)", async () => {
      const a = await member();
      await notify(a.userId);
      await notify(a.userId);
      redisDown();
      as(a);
      const res = await unreadRoute(req("/x"));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ data: { count: 2 } });
    });
  });
  describe("/api/v1/notifications/preferences", () => {
    const patch = (body: unknown) =>
      prefsPatch(
        req("/x", {
          method: "PATCH",
          headers: { origin: ORIGIN, "content-type": "application/json" },
          body: JSON.stringify(body),
        })
      );

    it("401s a signed-out caller", async () => {
      as(null);
      expect((await prefsGet(req("/x"))).status).toBe(401);
      expect((await patch({ domain: "JOB", enabled: false })).status).toBe(401);
    });

    it("GET reports every domain enabled when no row is stored", async () => {
      as(await member());
      const res = await prefsGet(req("/x"));
      expect(res.status).toBe(200);
      const { data } = (await res.json()) as {
        data: { domain: string; email: boolean }[];
      };
      expect(data.map((d) => d.domain).sort()).toEqual(
        [
          "ACHIEVEMENT",
          "CONNECTION",
          "EVENT",
          "JOB",
          "MESSAGE",
          "MENTORSHIP",
          "MODERATION",
          "POST",
        ].sort()
      );
      expect(data.every((d) => d.email)).toBe(true);
    });

    it("PATCH disables one domain for the caller only, and can re-enable it", async () => {
      const a = await member();
      const b = await member();
      as(a);
      expect((await patch({ domain: "JOB", enabled: false })).status).toBe(204);
      const read = async (actor: Actor) => {
        as(actor);
        const { data } = (await (await prefsGet(req("/x"))).json()) as {
          data: { domain: string; email: boolean }[];
        };
        return data.find((d) => d.domain === "JOB")!.email;
      };
      expect(await read(a)).toBe(false);
      expect(await read(b)).toBe(true);
      as(a);
      expect((await patch({ domain: "JOB", enabled: true })).status).toBe(204);
      expect(await read(a)).toBe(true);
    });

    it.each([
      [{ domain: "BILLING", enabled: false }],
      [{ domain: "TRANSACTIONAL", enabled: false }],
      [{ domain: "JOB", enabled: "no" }],
      [{ domain: "JOB", enabled: false, userId: "someone-else" }],
      [{ enabled: false }],
    ])("PATCH rejects %j with 400 VALIDATION_FAILED", async (body) => {
      as(await member());
      const res = await patch(body);
      expect(res.status).toBe(400);
      expect(
        ((await res.json()) as { error: { code: string } }).error.code
      ).toBe("VALIDATION_FAILED");
    });

    it("PATCH 403s a cross-origin request", async () => {
      as(await member());
      const res = await prefsPatch(
        req("/x", {
          method: "PATCH",
          headers: { origin: "https://evil.test" },
          body: "{}",
        })
      );
      expect(res.status).toBe(403);
    });
  });
});
