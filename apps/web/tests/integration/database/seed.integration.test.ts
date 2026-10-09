import { hashPassword, verifyPassword } from "better-auth/crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runSeed, seedDevAdmin } from "@nitap/database/seed";

import type { TestDatabase } from "../../support/test-database";
import { createTestDatabase } from "../../support/test-database";

async function snapshot(db: TestDatabase) {
  return {
    roles: await db.prisma.role.findMany({ orderBy: { name: "asc" } }),
    rolePermissions: await db.prisma.rolePermission.findMany({
      orderBy: [{ roleId: "asc" }, { permission: "asc" }],
    }),
    departments: await db.prisma.department.findMany({
      orderBy: { code: "asc" },
    }),
    degrees: await db.prisma.degree.findMany({ orderBy: { code: "asc" } }),
  };
}

describe("seed (idempotent)", () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  afterEach(async () => {
    await db.drop();
  });

  it("seeds roles, role_permission bundles, departments and degrees", async () => {
    await runSeed(db.prisma);
    expect(await db.prisma.role.count()).toBe(9);
    expect(await db.prisma.rolePermission.count()).toBeGreaterThan(0);
    expect(await db.prisma.department.count()).toBe(5);
    expect(await db.prisma.degree.count()).toBe(3);
  });

  it("running it twice changes nothing", async () => {
    await runSeed(db.prisma);
    const before = await snapshot(db);

    await runSeed(db.prisma);

    expect(await snapshot(db)).toEqual(before);
  });

  it("seeds a dev super admin whose password Better Auth can verify, idempotently", async () => {
    await runSeed(db.prisma);
    const passwordHash = await hashPassword("change-me-locally-1234");
    const admin = { email: "admin@example.com", passwordHash };

    await seedDevAdmin(db.prisma, admin);
    await seedDevAdmin(db.prisma, admin);

    expect(await db.prisma.user.count()).toBe(1);
    const user = await db.prisma.user.findUniqueOrThrow({
      where: { email: "admin@example.com" },
      include: { accounts: true, userRoles: { include: { role: true } } },
    });
    expect(user.accountState).toBe("VERIFIED");
    expect(user.accounts).toHaveLength(1);
    expect(
      await verifyPassword({
        hash: user.accounts[0]!.password!,
        password: "change-me-locally-1234",
      })
    ).toBe(true);
    expect(user.userRoles.map((r) => r.role.name)).toEqual(["SUPER_ADMIN"]);
  });
});
