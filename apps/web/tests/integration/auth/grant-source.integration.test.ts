import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AccountState } from "@nitap/database";
import { ROLE_PERMISSIONS } from "@nitap/database/role-permissions";
import { runSeed } from "@nitap/database/seed";

import { createAuthorization } from "@/modules/auth/application/authorize";
import { resolveActor } from "@/modules/auth/application/resolve-actor";
import { ACCOUNT_STATES } from "@/modules/auth/domain/actor";
import { PERMISSIONS } from "@/modules/auth/domain/permission";
import { createPrismaGrantSource } from "@/modules/auth/infrastructure/prisma-grant-source";

import type { TestDatabase } from "../../support/test-database";
import { createTestDatabase } from "../../support/test-database";

describe("PrismaGrantSource (real PostgreSQL)", () => {
  let db: TestDatabase;
  let source: ReturnType<typeof createPrismaGrantSource>;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    source = createPrismaGrantSource(db.prisma);
  });

  afterEach(async () => {
    await db.drop();
  });

  const makeUser = (email: string, accountState: AccountState = "VERIFIED") =>
    db.prisma.user.create({ data: { name: email, email, accountState } });

  async function assignRole(
    userId: string,
    roleName: string,
    grantedBy: string
  ) {
    const role = await db.prisma.role.findUniqueOrThrow({
      where: { name: roleName },
    });
    return db.prisma.userRole.create({
      data: { userId, roleId: role.id, grantedBy },
    });
  }

  const NOW = new Date();
  const permissionsOf = (grants: readonly { permission: string }[]) =>
    new Set(grants.map((g) => g.permission));

  it("returns a role's permissions as GLOBAL grants that never expire", async () => {
    const admin = await makeUser("admin@example.test");
    const student = await makeUser("student@example.test");
    await assignRole(student.id, "STUDENT", admin.id);

    const grants = await source.loadGrants(student.id, NOW);

    expect(permissionsOf(grants)).toEqual(new Set(ROLE_PERMISSIONS.STUDENT));
    expect(
      grants.every((g) => g.scope === "GLOBAL" && g.expiresAt === null)
    ).toBe(true);
  });

  it("adds direct global and chapter-scoped grants to the role's permissions", async () => {
    const admin = await makeUser("admin@example.test");
    const user = await makeUser("user@example.test");
    await assignRole(user.id, "ALUMNI", admin.id);
    const chapter = await db.prisma.chapter.create({ data: { slug: "delhi" } });
    await db.prisma.permissionGrant.createMany({
      data: [
        {
          userId: user.id,
          permission: PERMISSIONS.EVENT_MANAGE,
          scopeType: "CHAPTER",
          chapterId: chapter.id,
          grantedBy: admin.id,
        },
        {
          userId: user.id,
          permission: PERMISSIONS.ANALYTICS_VIEW,
          scopeType: "GLOBAL",
          grantedBy: admin.id,
        },
      ],
    });

    const grants = await source.loadGrants(user.id, NOW);

    expect(grants).toContainEqual({
      permission: PERMISSIONS.EVENT_MANAGE,
      scope: "CHAPTER",
      chapterId: chapter.id,
      expiresAt: null,
    });
    expect(grants).toContainEqual({
      permission: PERMISSIONS.ANALYTICS_VIEW,
      scope: "GLOBAL",
      expiresAt: null,
    });
    expect(permissionsOf(grants)).toContain(PERMISSIONS.MENTOR_OPT_IN);
  });

  it("excludes expired direct grants and keeps unexpired ones with their expiry", async () => {
    const admin = await makeUser("admin@example.test");
    const user = await makeUser("user@example.test");
    const future = new Date(NOW.getTime() + 3_600_000);
    const past = new Date(NOW.getTime() - 3_600_000);
    await db.prisma.permissionGrant.createMany({
      data: [
        {
          userId: user.id,
          permission: PERMISSIONS.EVENT_CREATE,
          scopeType: "GLOBAL",
          grantedBy: admin.id,
          expiresAt: past,
        },
        {
          userId: user.id,
          permission: PERMISSIONS.JOB_APPROVE,
          scopeType: "GLOBAL",
          grantedBy: admin.id,
          expiresAt: future,
        },
      ],
    });

    const grants = await source.loadGrants(user.id, NOW);

    expect(permissionsOf(grants)).toEqual(new Set([PERMISSIONS.JOB_APPROVE]));
    expect(grants[0]?.expiresAt).toEqual(future);
  });

  it("sees a role removal on the very next load", async () => {
    const admin = await makeUser("admin@example.test");
    const user = await makeUser("user@example.test");
    const assignment = await assignRole(user.id, "STUDENT", admin.id);
    expect((await source.loadGrants(user.id, NOW)).length).toBeGreaterThan(0);

    await db.prisma.userRole.delete({ where: { id: assignment.id } });

    expect(await source.loadGrants(user.id, NOW)).toEqual([]);
  });

  it("never returns another user's grants", async () => {
    const admin = await makeUser("admin@example.test");
    const a = await makeUser("a@example.test");
    const b = await makeUser("b@example.test");
    await assignRole(a.id, "SUPER_ADMIN", admin.id);

    expect(await source.loadGrants(b.id, NOW)).toEqual([]);
  });

  it("drops a permission name that is not in the registry instead of trusting it", async () => {
    const admin = await makeUser("admin@example.test");
    const user = await makeUser("user@example.test");
    await db.prisma.permissionGrant.create({
      data: {
        userId: user.id,
        permission: "not.a.permission",
        scopeType: "GLOBAL",
        grantedBy: admin.id,
      },
    });

    expect(await source.loadGrants(user.id, NOW)).toEqual([]);
  });
});

describe("the actor follows the live account state", () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
  });

  afterEach(async () => {
    await db.drop();
  });

  it("confines a user to nothing the moment they are suspended, and restores them on reinstatement", async () => {
    const deps = {
      grantSource: createPrismaGrantSource(db.prisma),
      now: () => new Date(),
    };
    const { can } = createAuthorization({
      observer: { record() {} },
      now: deps.now,
    });
    const admin = await db.prisma.user.create({
      data: {
        name: "a",
        email: "admin@example.test",
        accountState: "VERIFIED",
      },
    });
    const user = await db.prisma.user.create({
      data: { name: "u", email: "user@example.test", accountState: "VERIFIED" },
    });
    const role = await db.prisma.role.findUniqueOrThrow({
      where: { name: "ALUMNI" },
    });
    await db.prisma.userRole.create({
      data: { userId: user.id, roleId: role.id, grantedBy: admin.id },
    });

    // Mirrors what getActor() does: read the live user row, then resolve.
    const actorNow = async () => {
      const row = await db.prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      return resolveActor(
        deps,
        { userId: row.id, accountState: row.accountState },
        "req-1"
      );
    };

    expect(can(await actorNow(), PERMISSIONS.JOB_CREATE)).toBe(true);

    await db.prisma.user.update({
      where: { id: user.id },
      data: { accountState: "SUSPENDED" },
    });
    const suspended = await actorNow();
    expect(suspended.grants).toEqual([]);
    for (const permission of Object.values(PERMISSIONS)) {
      expect(can(suspended, permission), permission).toBe(false);
    }

    await db.prisma.user.update({
      where: { id: user.id },
      data: { accountState: "VERIFIED" },
    });
    expect(can(await actorNow(), PERMISSIONS.JOB_CREATE)).toBe(true);
  });

  it("keeps the domain's AccountState list in step with the database enum", () => {
    expect([...ACCOUNT_STATES].sort()).toEqual(
      Object.values(AccountState).sort()
    );
  });
});
