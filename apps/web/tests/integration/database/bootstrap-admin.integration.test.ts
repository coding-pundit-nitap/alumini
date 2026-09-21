import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  BootstrapRefusedError,
  bootstrapSuperAdmin,
  runSeed,
  seedAdminUser,
  seedDevAdmin,
  seedDevCoordinator,
} from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

const HASH = "scrypt:not-a-real-hash";

describe("admin seeding and bootstrap (real PostgreSQL)", () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
  });

  afterEach(async () => {
    await db.drop();
  });

  const rolesOf = async (email: string) =>
    (
      await db.prisma.userRole.findMany({
        where: { user: { email } },
        include: { role: true, user: true },
      })
    ).map((r) => [r.role.name, r.grantedBy === r.user.id] as const);

  it("bootstrap creates a verified super admin with a credential, a profile and a self-granted role", async () => {
    await bootstrapSuperAdmin(db.prisma, {
      email: "root@inst.test",
      passwordHash: HASH,
    });

    const user = await db.prisma.user.findUniqueOrThrow({
      where: { email: "root@inst.test" },
      include: { profile: true, accounts: true },
    });
    expect(user).toMatchObject({
      accountState: "VERIFIED",
      emailVerified: true,
    });
    expect(user.profile).toMatchObject({ fullName: expect.any(String) });
    expect(user.accounts).toEqual([
      expect.objectContaining({ providerId: "credential", password: HASH }),
    ]);
    expect(await rolesOf("root@inst.test")).toEqual([["SUPER_ADMIN", true]]);
  });

  it("bootstrap refuses when a super admin already exists, and creates nothing", async () => {
    await bootstrapSuperAdmin(db.prisma, {
      email: "root@inst.test",
      passwordHash: HASH,
    });

    await expect(
      bootstrapSuperAdmin(db.prisma, {
        email: "second@inst.test",
        passwordHash: HASH,
      })
    ).rejects.toBeInstanceOf(BootstrapRefusedError);

    expect(
      await db.prisma.user.findUnique({ where: { email: "second@inst.test" } })
    ).toBeNull();
  });

  it("the refusal never mentions the password hash", async () => {
    await bootstrapSuperAdmin(db.prisma, {
      email: "root@inst.test",
      passwordHash: HASH,
    });
    await expect(
      bootstrapSuperAdmin(db.prisma, {
        email: "second@inst.test",
        passwordHash: HASH,
      })
    ).rejects.toSatisfy((error: Error) => !error.message.includes(HASH));
  });

  it("the existing dev admin seed still works and is idempotent", async () => {
    await seedDevAdmin(db.prisma, {
      email: "dev@inst.test",
      passwordHash: HASH,
    });
    await seedDevAdmin(db.prisma, {
      email: "dev@inst.test",
      passwordHash: "other-hash",
    });

    expect(
      await db.prisma.user.count({ where: { email: "dev@inst.test" } })
    ).toBe(1);
    expect(await rolesOf("dev@inst.test")).toEqual([["SUPER_ADMIN", true]]);
    const account = await db.prisma.account.findFirstOrThrow({
      where: { user: { email: "dev@inst.test" } },
    });
    expect(account.password).toBe(HASH); // never overwritten on re-seed
  });

  it("the dev coordinator holds the coordinator role and is verified", async () => {
    await seedDevCoordinator(db.prisma, {
      email: "coord@inst.test",
      passwordHash: HASH,
    });

    expect(await rolesOf("coord@inst.test")).toEqual([
      ["ALUMNI_COORDINATOR", true],
    ]);
    expect(
      await db.prisma.user.findUniqueOrThrow({
        where: { email: "coord@inst.test" },
      })
    ).toMatchObject({ accountState: "VERIFIED" });
  });

  it("seedAdminUser is idempotent: a second call keeps one user and one role row", async () => {
    const user = {
      email: "x@inst.test",
      name: "X",
      roleName: "MODERATOR" as const,
      passwordHash: HASH,
    };
    await seedAdminUser(db.prisma, user);
    await seedAdminUser(db.prisma, user);
    expect(await rolesOf("x@inst.test")).toEqual([["MODERATOR", true]]);
  });
});
