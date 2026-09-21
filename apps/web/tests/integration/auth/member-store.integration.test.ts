import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runSeed } from "@nitap/database/seed";

import { createTransactionRunner } from "@/infrastructure/database/transaction-runner";
import { createApplyEmailVerification } from "@/modules/auth/application/apply-email-verification";
import { createProvisionMember } from "@/modules/auth/application/provision-member";
import type { EmailPolicy } from "@/modules/auth/domain/email-policy";
import { createPrismaGrantSource } from "@/modules/auth/infrastructure/prisma-grant-source";
import { createPrismaMemberStore } from "@/modules/auth/infrastructure/prisma-member-store";

import type { TestDatabase } from "../../support/test-database";
import { createTestDatabase } from "../../support/test-database";

const policy: EmailPolicy = new Map([
  ["inst.test", { role: "STUDENT", autoVerify: true }],
  ["broken.test", { role: "NO_SUCH_ROLE", autoVerify: true }],
]);

describe("PrismaMemberStore (real PostgreSQL)", () => {
  let db: TestDatabase;
  let store: ReturnType<typeof createPrismaMemberStore>;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    store = createPrismaMemberStore(createTransactionRunner(db.prisma));
  });

  afterEach(async () => {
    await db.drop();
  });

  const makeUser = (
    email: string,
    overrides: {
      emailVerified?: boolean;
      accountState?: "PENDING" | "REJECTED";
    } = {}
  ) =>
    db.prisma.user.create({
      data: { name: "Asha Rao", email, emailVerified: true, ...overrides },
    });

  it("creates the profile once and reports whether this call created it", async () => {
    const user = await makeUser("a@inst.test");
    const provision = createProvisionMember({ store });

    expect(await provision(user.id)).toEqual({ created: true });
    expect(await provision(user.id)).toEqual({ created: false });

    const profiles = await db.prisma.profile.findMany();
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({
      userId: user.id,
      fullName: "Asha Rao",
      visibility: "MEMBERS_ONLY",
    });
  });

  it("verifies an institutional user and the role's permissions become effective", async () => {
    const user = await makeUser("a@inst.test");
    const apply = createApplyEmailVerification({ store, policy: () => policy });

    expect(await apply(user.id)).toEqual({
      outcome: "verified",
      role: "STUDENT",
    });

    const after = await db.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(after.accountState).toBe("VERIFIED");
    const roles = await db.prisma.userRole.findMany({
      where: { userId: user.id },
      include: { role: true },
    });
    expect(roles.map((r) => [r.role.name, r.grantedBy])).toEqual([
      ["STUDENT", user.id],
    ]);
    const grants = await createPrismaGrantSource(db.prisma).loadGrants(
      user.id,
      new Date()
    );
    expect(grants.some((g) => g.permission === "profile.read")).toBe(true);
  });

  it("does not touch a REJECTED account", async () => {
    const user = await makeUser("a@inst.test", { accountState: "REJECTED" });
    const apply = createApplyEmailVerification({ store, policy: () => policy });

    expect(await apply(user.id)).toEqual({ outcome: "unchanged" });
    expect(await db.prisma.userRole.count()).toBe(0);
  });

  it("rolls the state change back when the role cannot be assigned", async () => {
    const user = await makeUser("a@broken.test");
    const apply = createApplyEmailVerification({ store, policy: () => policy });

    await expect(apply(user.id)).rejects.toThrow();

    const after = await db.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(after.accountState).toBe("PENDING");
    expect(await db.prisma.userRole.count()).toBe(0);
  });

  it("gives exactly one role row when two verifications race", async () => {
    const user = await makeUser("a@inst.test");
    const apply = createApplyEmailVerification({ store, policy: () => policy });

    const results = await Promise.all([apply(user.id), apply(user.id)]);

    expect(results.filter((r) => r.outcome === "verified")).toHaveLength(1);
    expect(await db.prisma.userRole.count({ where: { userId: user.id } })).toBe(
      1
    );
  });
});
