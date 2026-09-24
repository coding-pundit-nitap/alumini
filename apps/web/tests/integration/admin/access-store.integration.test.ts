import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAuditWriter } from "@nitap/database/audit";
import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createTransactionRunner } from "@/infrastructure/database/transaction-runner";
import { ConflictError } from "@/lib/errors";
import { createPrismaAccessStore } from "@/modules/admin/server";

describe("PrismaAccessStore (spec B12-5, B12-6, B12-7)", () => {
  let db: TestDatabase;
  let store: ReturnType<typeof createPrismaAccessStore>;
  let grantor: string;

  const user = async (
    name: string,
    accountState:
      "VERIFIED" | "PENDING" | "SUSPENDED" | "DEACTIVATED" = "VERIFIED"
  ) =>
    (
      await db.prisma.user.create({
        data: { name, email: `${name}@example.test`, accountState },
      })
    ).id;
  const giveRole = async (userId: string, role: string) => {
    const { id: roleId } = await db.prisma.role.findUniqueOrThrow({
      where: { name: role },
    });
    await db.prisma.userRole.create({
      data: { userId, roleId, grantedBy: grantor },
    });
  };
  const session = (userId: string) =>
    db.prisma.session.create({
      data: {
        userId,
        token: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    grantor = await user("grantor");
    store = createPrismaAccessStore({
      runner: createTransactionRunner(db.prisma),
      audit: createAuditWriter(),
    });
  });
  afterEach(() => db.drop());

  it("changes state, deletes sessions and audits atomically", async () => {
    const target = await user("target");
    await session(target);
    await session(grantor);
    await store.transaction(async (tx) => {
      expect(
        await tx.setAccountState(target, "VERIFIED", "SUSPENDED", null)
      ).toBe(true);
      expect(await tx.deleteSessions(target)).toBe(1);
      await tx.audit({
        action: "user.suspended",
        actorId: grantor,
        targetUserId: target,
        metadata: { reason: "SPAM", sessionsRevoked: 1 },
      });
    });
    expect(
      (await db.prisma.user.findUniqueOrThrow({ where: { id: target } }))
        .accountState
    ).toBe("SUSPENDED");
    expect(await db.prisma.session.count({ where: { userId: target } })).toBe(
      0
    );
    expect(await db.prisma.session.count({ where: { userId: grantor } })).toBe(
      1
    );
    expect(
      await db.prisma.auditLog.count({
        where: { action: "user.suspended", targetId: target },
      })
    ).toBe(1);
  });

  it("rolls back state and sessions when the audit write fails", async () => {
    const target = await user("target");
    await session(target);
    await expect(
      store.transaction(async (tx) => {
        await tx.setAccountState(target, "VERIFIED", "SUSPENDED", null);
        await tx.deleteSessions(target);
        await tx.audit({
          action: "user.suspended",
          actorId: "00000000-0000-4000-8000-00000000dead",
          targetUserId: target,
          metadata: {},
        }); // actor FK violation
      })
    ).rejects.toThrow();
    expect(
      (await db.prisma.user.findUniqueOrThrow({ where: { id: target } }))
        .accountState
    ).toBe("VERIFIED");
    expect(await db.prisma.session.count({ where: { userId: target } })).toBe(
      1
    );
  });

  it("guards setAccountState on the expected state", async () => {
    const target = await user("target", "PENDING");
    expect(
      await store.transaction((tx) =>
        tx.setAccountState(target, "VERIFIED", "SUSPENDED", null)
      )
    ).toBe(false);
  });

  it("maps duplicate role and grant to 409s", async () => {
    const target = await user("target");
    await giveRole(target, "STAFF");
    await expect(
      store.transaction((tx) => tx.insertUserRole(target, "STAFF", grantor))
    ).rejects.toMatchObject({ code: "ROLE_ALREADY_HELD" });
    const grant = {
      userId: target,
      permission: "event.manage",
      scope: "GLOBAL",
      chapterId: null,
      expiresAt: null,
      grantedBy: grantor,
    } as const;
    await store.transaction((tx) => tx.insertGrant(grant));
    await expect(
      store.transaction((tx) => tx.insertGrant(grant))
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("findGrant only finds a grant on the given user", async () => {
    const a = await user("a");
    const b = await user("b");
    const row = await store.transaction((tx) =>
      tx.insertGrant({
        userId: a,
        permission: "event.manage",
        scope: "GLOBAL",
        chapterId: null,
        expiresAt: null,
        grantedBy: grantor,
      })
    );
    expect(await store.transaction((tx) => tx.findGrant(b, row.id))).toBeNull();
    expect(
      await store.transaction((tx) => tx.findGrant(a, row.id))
    ).toMatchObject({ id: row.id });
  });

  it("serializes concurrent removal of the last two super admins", async () => {
    const [s1, s2] = [await user("s1"), await user("s2")];
    await giveRole(s1, "SUPER_ADMIN");
    await giveRole(s2, "SUPER_ADMIN");
    const demote = (target: string) =>
      store.transaction(async (tx) => {
        await tx.findUserForUpdate(target);
        const active = await tx.lockSuperAdmins();
        if (active.length <= 1 && active.includes(target))
          throw new ConflictError("LAST_SUPER_ADMIN");
        await tx.deleteUserRole(target, "SUPER_ADMIN");
      });
    const results = await Promise.allSettled([demote(s1), demote(s2)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "LAST_SUPER_ADMIN" },
    });
  });
});
