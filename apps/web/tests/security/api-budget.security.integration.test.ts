// The API-wide per-user allowance (SRS §36, spec 16 SD-7) through a real Route Handler, the real getActor
// and real Redis. Only Better Auth's session lookup and next/headers are doubled; the database is a test one.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

const mocks = vi.hoisted(() => ({
  dbRef: { current: null as TestDatabase | null },
  sessionUserId: { current: null as string | null },
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
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/modules/auth/infrastructure/auth", () => ({
  auth: {
    api: {
      getSession: async () =>
        mocks.sessionUserId.current
          ? {
              user: {
                id: mocks.sessionUserId.current,
                accountState: "VERIFIED",
              },
            }
          : null,
    },
  },
}));

import { API_BUDGET } from "@/infrastructure/http/api-budget";
import { getRedis } from "@/infrastructure/redis/client";
import { getActor } from "@/modules/auth/infrastructure/actor";

import { GET as unreadCount } from "@/app/api/v1/notifications/unread-count/route";

const call = () =>
  unreadCount(
    new Request("https://alumni.example.test/api/v1/notifications/unread-count")
  );

describe("API budget through a real route (SRS §36, spec 16 SD-7)", () => {
  let db: TestDatabase;
  const userIds: string[] = [];

  async function member(): Promise<string> {
    const user = await db.prisma.user.create({
      data: {
        name: "Budget",
        email: `budget-${userIds.length}-${Date.now()}@example.test`,
        accountState: "VERIFIED",
      },
    });
    const { id: roleId } = await db.prisma.role.findUniqueOrThrow({
      where: { name: "ALUMNI" },
    });
    await db.prisma.userRole.create({
      data: { userId: user.id, roleId, grantedBy: user.id },
    });
    userIds.push(user.id);
    return user.id;
  }

  beforeAll(async () => {
    db = await createTestDatabase();
    mocks.dbRef.current = db;
    await runSeed(db.prisma);
  });

  afterAll(async () => {
    const redis = await getRedis();
    for (const id of userIds) await redis.del(`rl:auth:api:user:${id}`);
    await db.drop();
  });

  it("serves the allowance, then answers 429 RATE_LIMITED with Retry-After", async () => {
    mocks.sessionUserId.current = await member();
    for (let i = 0; i < API_BUDGET.max; i += 1) {
      const response = await call();
      expect(response.status, `request ${i + 1}`).toBe(200);
    }
    const refused = await call();
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await refused.json()).error.code).toBe("RATE_LIMITED");
  });

  it("is per user: another member is unaffected", async () => {
    mocks.sessionUserId.current = await member();
    expect((await call()).status).toBe(200);
  });

  it("charges nothing for a signed-out caller, who gets 401 without work", async () => {
    mocks.sessionUserId.current = null;
    expect((await call()).status).toBe(401);
  });

  it("charges nothing outside a Route Handler (pages and Server Actions)", async () => {
    const id = await member();
    mocks.sessionUserId.current = id;
    await getActor();
    const redis = await getRedis();
    expect(await redis.get(`rl:auth:api:user:${id}`)).toBeNull();
  });
});
