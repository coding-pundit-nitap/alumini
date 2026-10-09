// Route-level, real PostgreSQL, real authorize; only the session (getActor) is doubled.
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { createAuditWriter } from "@nitap/database/audit";
import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

const mocks = vi.hoisted(() => ({
  dbRef: { current: null as TestDatabase | null },
  getActor: vi.fn(),
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

import type { Actor } from "@/modules/auth";
import { resolveActor } from "@/modules/auth/application/resolve-actor";
import { createPrismaGrantSource } from "@/modules/auth/infrastructure/prisma-grant-source";

import { GET } from "@/app/api/v1/admin/audit-log/route";

const get = (query = "") =>
  GET(
    new Request(`https://alumni.example.test/api/v1/admin/audit-log${query}`)
  );

describe("GET /api/v1/admin/audit-log", () => {
  let db: TestDatabase;
  let grantorId: string;
  let admin: Actor;
  let alumnus: Actor;

  async function withRole(name: string, role: string): Promise<Actor> {
    const user = await db.prisma.user.create({
      data: { name, email: `${name}@example.test`, accountState: "VERIFIED" },
    });
    const { id: roleId } = await db.prisma.role.findUniqueOrThrow({
      where: { name: role },
    });
    await db.prisma.userRole.create({
      data: { userId: user.id, roleId, grantedBy: grantorId },
    });
    return resolveActor(
      {
        grantSource: createPrismaGrantSource(db.prisma),
        now: () => new Date(),
      },
      { userId: user.id, accountState: "VERIFIED" },
      "req-admin-audit-security"
    );
  }
  const as = (actor: Actor | null) => mocks.getActor.mockResolvedValue(actor);

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
    admin = await withRole("instadmin", "INSTITUTE_ADMIN");
    alumnus = await withRole("alumnus", "ALUMNI");
    await createAuditWriter().record(db.prisma, {
      actorId: admin.userId,
      action: "job.approved",
      targetType: "job",
      targetId: alumnus.userId,
    });
    await createAuditWriter().record(db.prisma, {
      actorId: alumnus.userId,
      action: "connection.blocked",
      targetType: "user",
      targetId: admin.userId,
    });
  });
  afterAll(async () => {
    await db.drop();
  });
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("401 without a session", async () => {
    as(null);
    expect((await get()).status).toBe(401);
  });

  it("404 (not 403) for a verified member without audit.read", async () => {
    as(alumnus);
    const res = await get();
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });

  it("200 with filtered rows and the actor joined for an INSTITUTE_ADMIN", async () => {
    as(admin);
    const res = await get("?action=job.approved");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      action: "job.approved",
      actor: { id: admin.userId, email: "instadmin@example.test" },
    });
    expect(typeof body.data[0].createdAt).toBe("string");
    expect(body.nextCursor).toBeNull();
  });

  it("pages with a cursor", async () => {
    as(admin);
    const first = await (await get("?limit=1")).json();
    expect(first.data).toHaveLength(1);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await (
      await get(`?limit=1&cursor=${encodeURIComponent(first.nextCursor)}`)
    ).json();
    expect(second.data).toHaveLength(1);
    expect(second.data[0].id).not.toBe(first.data[0].id);
  });

  it("400 VALIDATION_FAILED on a malformed filter and INVALID_CURSOR on a bad cursor", async () => {
    as(admin);
    const bad = await get("?actorId=x");
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe("VALIDATION_FAILED");
    const cursor = await get("?cursor=zzz");
    expect(cursor.status).toBe(400);
    expect((await cursor.json()).error.code).toBe("INVALID_CURSOR");
  });

  it("lets audit.read filter by any actor: the log is admin-wide by design, not an IDOR", async () => {
    as(admin);
    const body = await (await get(`?actorId=${alumnus.userId}`)).json();
    // The 404 test above may also leave a best-effort authz.denied row for this actor.
    const rows = body.data as { action: string; actor: { id: string } }[];
    expect(rows.every((r) => r.actor.id === alumnus.userId)).toBe(true);
    expect(rows.map((r) => r.action)).toContain("connection.blocked");
  });
});
