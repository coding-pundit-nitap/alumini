// Route-level, real PostgreSQL, real authorize; only the session (getActor) is doubled.
// Same construction as tests/security/admin-audit-log.security.integration.test.ts.
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
vi.mock("@/modules/auth/infrastructure/actor", async () => {
  const { createPrismaGrantSource } =
    await import("@/modules/auth/infrastructure/prisma-grant-source");
  return {
    getActor: mocks.getActor,
    loadGrants: (userId: string, now: Date) =>
      createPrismaGrantSource(mocks.dbRef.current!.prisma).loadGrants(
        userId,
        now
      ),
  };
});
vi.mock("@/modules/auth/infrastructure/auth", () => ({ auth: {} }));
// The same-origin guard compares against BETTER_AUTH_URL when it is set (it is, in CI and in .env); pin it to
// this file's origin so the guard is tested, not the environment.
vi.mock("@/config/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/config/env")>();
  return {
    ...actual,
    env: { ...actual.env, BETTER_AUTH_URL: "https://alumni.example.test" },
  };
});

import type { Actor, AccountState } from "@/modules/auth";
import { resolveActor } from "@/modules/auth/application/resolve-actor";
import { createPrismaGrantSource } from "@/modules/auth/infrastructure/prisma-grant-source";

import { POST as postGrant } from "@/app/api/v1/admin/users/[id]/permission-grants/route";
import { DELETE as deleteRole } from "@/app/api/v1/admin/users/[id]/roles/[role]/route";
import { POST as postRole } from "@/app/api/v1/admin/users/[id]/roles/route";
import { PATCH } from "@/app/api/v1/admin/users/[id]/route";
import { GET } from "@/app/api/v1/admin/users/route";

const ORIGIN = "https://alumni.example.test";

const jsonRequest = (
  url: string,
  method: string,
  body: unknown,
  origin: string | null = ORIGIN
) =>
  new Request(url, {
    method,
    headers: {
      "content-type": "application/json",
      ...(origin ? { origin } : {}),
    },
    body: JSON.stringify(body),
  });

describe("admin users routes (security)", () => {
  let db: TestDatabase;
  let grantorId: string;

  async function withRole(
    name: string,
    role: string,
    accountState: AccountState = "VERIFIED"
  ): Promise<Actor> {
    const user = await db.prisma.user.create({
      data: { name, email: `${name}@example.test`, accountState },
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
      { userId: user.id, accountState },
      "req-admin-users-security"
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
  });
  afterAll(async () => {
    await db.drop();
  });
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("PATCH /api/v1/admin/users/:id", () => {
    it("suspends as INSTITUTE_ADMIN: 200, sessions revoked, one user.suspended audit row", async () => {
      const admin = await withRole("insta1", "INSTITUTE_ADMIN");
      const target = await withRole("target1", "ALUMNI");
      await db.prisma.session.create({
        data: {
          userId: target.userId,
          token: "tok-1",
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      as(admin);
      const res = await PATCH(
        jsonRequest(`${ORIGIN}/api/v1/admin/users/${target.userId}`, "PATCH", {
          accountState: "SUSPENDED",
          reason: "SPAM",
        }),
        { params: Promise.resolve({ id: target.userId }) }
      );
      expect(res.status).toBe(200);
      expect((await res.json()).data).toEqual({ accountState: "SUSPENDED" });

      const sessions = await db.prisma.session.count({
        where: { userId: target.userId },
      });
      expect(sessions).toBe(0);

      const rows = await db.prisma.auditLog.findMany({
        where: { action: "user.suspended", targetId: target.userId },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.metadata).toMatchObject({ reason: "SPAM" });
    });

    it("as ALUMNI without user.suspend: 404, state unchanged, one authz.denied row", async () => {
      const alumnus = await withRole("alumnus1", "ALUMNI");
      const target = await withRole("target2", "ALUMNI");
      as(alumnus);
      const res = await PATCH(
        jsonRequest(`${ORIGIN}/api/v1/admin/users/${target.userId}`, "PATCH", {
          accountState: "SUSPENDED",
          reason: "SPAM",
        }),
        { params: Promise.resolve({ id: target.userId }) }
      );
      expect(res.status).toBe(404);

      const after = await db.prisma.user.findUniqueOrThrow({
        where: { id: target.userId },
      });
      expect(after.accountState).toBe("VERIFIED");

      await vi.waitFor(async () =>
        expect(
          await db.prisma.auditLog.count({
            where: { action: "authz.denied", actorId: alumnus.userId },
          })
        ).toBe(1)
      );
      const [row] = await db.prisma.auditLog.findMany({
        where: { action: "authz.denied", actorId: alumnus.userId },
      });
      expect(row!.actorId).toBe(alumnus.userId);
      expect(row!.targetId).toBe(target.userId);
      expect(row!.metadata).toMatchObject({ permission: "user.suspend" });
    });

    it("unauthenticated: 401", async () => {
      const target = await withRole("target3", "ALUMNI");
      as(null);
      const res = await PATCH(
        jsonRequest(`${ORIGIN}/api/v1/admin/users/${target.userId}`, "PATCH", {
          accountState: "SUSPENDED",
          reason: "SPAM",
        }),
        { params: Promise.resolve({ id: target.userId }) }
      );
      expect(res.status).toBe(401);
    });

    it("on oneself as INSTITUTE_ADMIN: 404 (self-service is concealed)", async () => {
      const admin = await withRole("insta2", "INSTITUTE_ADMIN");
      as(admin);
      const res = await PATCH(
        jsonRequest(`${ORIGIN}/api/v1/admin/users/${admin.userId}`, "PATCH", {
          accountState: "SUSPENDED",
          reason: "SPAM",
        }),
        { params: Promise.resolve({ id: admin.userId }) }
      );
      expect(res.status).toBe(404);
    });

    it("suspending a SUPER_ADMIN as INSTITUTE_ADMIN: 403 ACCESS_ESCALATION_FORBIDDEN", async () => {
      const admin = await withRole("insta3", "INSTITUTE_ADMIN");
      const superAdmin = await withRole("super1", "SUPER_ADMIN");
      as(admin);
      const res = await PATCH(
        jsonRequest(
          `${ORIGIN}/api/v1/admin/users/${superAdmin.userId}`,
          "PATCH",
          { accountState: "SUSPENDED", reason: "SPAM" }
        ),
        { params: Promise.resolve({ id: superAdmin.userId }) }
      );
      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe("ACCESS_ESCALATION_FORBIDDEN");
    });

    it("an unknown body field: 400 VALIDATION_FAILED, details[0].code UNKNOWN_FIELD", async () => {
      const admin = await withRole("insta4", "INSTITUTE_ADMIN");
      const target = await withRole("target4", "ALUMNI");
      as(admin);
      const res = await PATCH(
        jsonRequest(`${ORIGIN}/api/v1/admin/users/${target.userId}`, "PATCH", {
          accountState: "SUSPENDED",
          reason: "SPAM",
          extra: true,
        }),
        { params: Promise.resolve({ id: target.userId }) }
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_FAILED");
      expect(body.error.details[0].code).toBe("UNKNOWN_FIELD");
    });
  });

  describe("POST /api/v1/admin/users/:id/roles", () => {
    it("assigning INSTITUTE_ADMIN as INSTITUTE_ADMIN: 403 ACCESS_ESCALATION_FORBIDDEN", async () => {
      const admin = await withRole("insta5", "INSTITUTE_ADMIN");
      const target = await withRole("target5", "ALUMNI");
      as(admin);
      const res = await postRole(
        jsonRequest(
          `${ORIGIN}/api/v1/admin/users/${target.userId}/roles`,
          "POST",
          { role: "INSTITUTE_ADMIN" }
        ),
        { params: Promise.resolve({ id: target.userId }) }
      );
      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe("ACCESS_ESCALATION_FORBIDDEN");
    });
  });

  describe("POST /api/v1/admin/users/:id/permission-grants", () => {
    it("as ALUMNI_COORDINATOR: GLOBAL event.manage 403 (CHAPTER_ONLY); CHAPTER event.manage on a seeded chapter 201", async () => {
      const coordinator = await withRole("coord1", "ALUMNI_COORDINATOR");
      const target = await withRole("target6", "ALUMNI");
      as(coordinator);

      const globalRes = await postGrant(
        jsonRequest(
          `${ORIGIN}/api/v1/admin/users/${target.userId}/permission-grants`,
          "POST",
          { permission: "event.manage", scope: "GLOBAL" }
        ),
        { params: Promise.resolve({ id: target.userId }) }
      );
      expect(globalRes.status).toBe(403);
      expect((await globalRes.json()).error.code).toBe(
        "ACCESS_ESCALATION_FORBIDDEN"
      );

      const chapter = await db.prisma.chapter.create({
        data: { slug: "chapter-security-test" },
      });
      const chapterRes = await postGrant(
        jsonRequest(
          `${ORIGIN}/api/v1/admin/users/${target.userId}/permission-grants`,
          "POST",
          {
            permission: "event.manage",
            scope: "CHAPTER",
            chapterId: chapter.id,
          }
        ),
        { params: Promise.resolve({ id: target.userId }) }
      );
      expect(chapterRes.status).toBe(201);
      const body = await chapterRes.json();
      expect(body.data).toMatchObject({
        permission: "event.manage",
        scope: "CHAPTER",
        chapterId: chapter.id,
      });
    });
  });

  describe("DELETE /api/v1/admin/users/:id/roles/SUPER_ADMIN (last super admin)", () => {
    it("a suspended super admin gets 404; a second VERIFIED super admin can revoke one of two, then 409 on the last", async () => {
      const superA = await withRole("supera", "SUPER_ADMIN");
      const superB = await withRole(
        "superb-suspended",
        "SUPER_ADMIN",
        "SUSPENDED"
      );

      // The suspended admin holds no grants: 404, not 403.
      as(superB);
      const suspendedRes = await deleteRole(
        jsonRequest(
          `${ORIGIN}/api/v1/admin/users/${superA.userId}/roles/SUPER_ADMIN`,
          "DELETE",
          undefined
        ),
        {
          params: Promise.resolve({
            id: superA.userId,
            role: "SUPER_ADMIN",
          }),
        }
      );
      expect(suspendedRes.status).toBe(404);

      // The acting "second super admin" holds system.configure through a direct grant, not the SUPER_ADMIN
      // role itself, so lockSuperAdmins (which counts VERIFIED holders of the role row) never counts the
      // actor — letting us drive the count to exactly one without the actor ever targeting itself
      // (which would hit the no-self-service guard and answer 404, not 409).
      const acting = await db.prisma.user.create({
        data: {
          name: "second-super",
          email: "second-super@example.test",
          accountState: "VERIFIED",
        },
      });
      await db.prisma.permissionGrant.createMany({
        data: [
          {
            userId: acting.id,
            permission: "role.assign",
            scopeType: "GLOBAL",
            grantedBy: grantorId,
          },
          {
            userId: acting.id,
            permission: "system.configure",
            scopeType: "GLOBAL",
            grantedBy: grantorId,
          },
        ],
      });
      const actor = await resolveActor(
        {
          grantSource: createPrismaGrantSource(db.prisma),
          now: () => new Date(),
        },
        { userId: acting.id, accountState: "VERIFIED" },
        "req-last-super-admin"
      );
      as(actor);

      const adminY = await withRole("adminy", "SUPER_ADMIN");

      // At least two active (VERIFIED, role-holding) super admins besides the acting user, including
      // superA and adminY. Revoking one of them is fine.
      const firstRevoke = await deleteRole(
        jsonRequest(
          `${ORIGIN}/api/v1/admin/users/${superA.userId}/roles/SUPER_ADMIN`,
          "DELETE",
          undefined
        ),
        { params: Promise.resolve({ id: superA.userId, role: "SUPER_ADMIN" }) }
      );
      expect(firstRevoke.status).toBe(200);

      // Earlier cases in this file (e.g. the escalation-guard PATCH case) create their own VERIFIED
      // SUPER_ADMIN users that share this database; strip every other holder directly so adminY is
      // deterministically the only one left, regardless of test order.
      await db.prisma.userRole.deleteMany({
        where: {
          role: { name: "SUPER_ADMIN" },
          userId: { not: adminY.userId },
        },
      });

      // Only adminY remains active; revoking the last one is blocked.
      const lastRevoke = await deleteRole(
        jsonRequest(
          `${ORIGIN}/api/v1/admin/users/${adminY.userId}/roles/SUPER_ADMIN`,
          "DELETE",
          undefined
        ),
        { params: Promise.resolve({ id: adminY.userId, role: "SUPER_ADMIN" }) }
      );
      expect(lastRevoke.status).toBe(409);
      expect((await lastRevoke.json()).error.code).toBe("LAST_SUPER_ADMIN");
    });
  });

  describe("GET /api/v1/admin/users", () => {
    it("as MODERATOR (user.read_admin): 200 with the row; as ALUMNI: 404", async () => {
      const moderator = await withRole("mod1", "MODERATOR");
      const target = await withRole("searchable-target", "ALUMNI");
      as(moderator);
      const res = await GET(
        new Request(
          `${ORIGIN}/api/v1/admin/users?q=${encodeURIComponent("searchable-target@example.test")}`
        )
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.map((r: { id: string }) => r.id)).toContain(
        target.userId
      );

      const alumnus = await withRole("alumnus-reader", "ALUMNI");
      as(alumnus);
      const denied = await GET(new Request(`${ORIGIN}/api/v1/admin/users?q=x`));
      expect(denied.status).toBe(404);
    });
  });
});
