import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAuditWriter } from "@nitap/database/audit";
import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createTransactionRunner } from "@/infrastructure/database/transaction-runner";
import { NotFoundError } from "@/lib/errors";
import { createAuthorization } from "@/modules/auth/application/authorize";
import type { Actor } from "@/modules/auth/domain/actor";
import { createGetProfileForViewer } from "@/modules/users/application/get-profile-for-viewer";
import type { ProfileAudit } from "@/modules/users/application/profile-audit";
import { createUpdateOwnPrivacy } from "@/modules/users/application/update-own-privacy";
import { createUpdateOwnProfile } from "@/modules/users/application/update-own-profile";
import { noConnectionsLookup } from "@/modules/users/infrastructure/no-connections-lookup";
import { createPrismaProfileStore } from "@/modules/users/infrastructure/prisma-profile-store";
import { createProfileAudit } from "@/modules/users/infrastructure/profile-audit";

const { authorize, can } = createAuthorization({
  observer: { record() {} },
  now: () => new Date(),
});

const actor = (userId: string, over: Partial<Actor> = {}): Actor => ({
  userId,
  accountState: "VERIFIED",
  requestId: "r",
  grants: [
    { permission: "profile.read", scope: "GLOBAL", expiresAt: null },
    { permission: "profile.update", scope: "GLOBAL", expiresAt: null },
  ],
  ...over,
});

describe("users module against real PostgreSQL", () => {
  let db: TestDatabase;
  let ownerId: string;
  let otherId: string;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    const department = await db.prisma.department.findFirstOrThrow();
    const degree = await db.prisma.degree.findFirstOrThrow();
    const owner = await db.prisma.user.create({
      data: {
        name: "Asha",
        email: "asha@example.test",
        accountState: "VERIFIED",
      },
    });
    const other = await db.prisma.user.create({
      data: {
        name: "Ravi",
        email: "ravi@example.test",
        accountState: "VERIFIED",
      },
    });
    ownerId = owner.id;
    otherId = other.id;
    await db.prisma.profile.create({
      data: {
        userId: ownerId,
        fullName: "Asha",
        departmentId: department.id,
        degreeId: degree.id,
        graduationYear: 2019,
      },
    });
    await db.prisma.profile.create({
      data: { userId: otherId, fullName: "Ravi" },
    });
  });

  afterEach(async () => {
    await db.drop();
  });

  function build(auditOverride?: ProfileAudit) {
    const store = createPrismaProfileStore(db.prisma);
    const audit =
      auditOverride ??
      createProfileAudit({
        runner: createTransactionRunner(db.prisma),
        audit: createAuditWriter(),
      });
    return {
      updateProfile: createUpdateOwnProfile({ store, authorize }),
      updatePrivacy: createUpdateOwnPrivacy({ store, authorize }),
      get: createGetProfileForViewer({
        store,
        connections: noConnectionsLookup,
        audit,
        can,
      }),
    };
  }

  it("updates only the caller's row and never touches the institutional fields", async () => {
    const { updateProfile } = build();
    await updateProfile({
      actor: actor(ownerId),
      input: {
        fullName: "Asha Rao",
        headline: "Engineer",
        bio: null,
        location: "Goa",
      },
    });
    const owner = await db.prisma.profile.findUniqueOrThrow({
      where: { userId: ownerId },
    });
    const other = await db.prisma.profile.findUniqueOrThrow({
      where: { userId: otherId },
    });
    expect(owner).toMatchObject({
      fullName: "Asha Rao",
      headline: "Engineer",
      location: "Goa",
      graduationYear: 2019,
    });
    expect(owner.departmentId).not.toBeNull();
    expect(other.fullName).toBe("Ravi");
  });

  it("stores privacy settings, and a member then cannot see a PRIVATE profile (not-found)", async () => {
    const { updatePrivacy, get } = build();
    await updatePrivacy({
      actor: actor(ownerId),
      input: {
        visibility: "PRIVATE",
        contact: null,
        location: null,
        experience: null,
        education: null,
      },
    });
    await expect(
      get({ actor: actor(otherId), targetUserId: ownerId })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(
      (await get({ actor: actor(ownerId), targetUserId: ownerId })).fullName
    ).toBe("Asha");
  });

  it("shows department and degree names to a member of a MEMBERS_ONLY profile", async () => {
    const { get } = build();
    const view = await get({ actor: actor(otherId), targetUserId: ownerId });
    expect(view.institution?.graduationYear).toBe(2019);
    expect(view.institution?.department).toEqual(expect.any(String));
  });

  it("audits a privileged read in audit_log, and refuses the read if the audit write fails", async () => {
    await db.prisma.profile.update({
      where: { userId: ownerId },
      data: { visibility: "PRIVATE" },
    });
    const admin = actor(otherId, {
      grants: [
        { permission: "profile.read", scope: "GLOBAL", expiresAt: null },
        { permission: "profile.read_any", scope: "GLOBAL", expiresAt: null },
      ],
    });

    const { get } = build();
    const view = await get({ actor: admin, targetUserId: ownerId });
    expect(view.fullName).toBe("Asha");
    const rows = await db.prisma.auditLog.findMany({
      where: { action: "profile.read_any", targetId: ownerId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorId: otherId, targetType: "profile" });

    const failing = build({
      recordPrivilegedRead: async () => {
        throw new Error("audit down");
      },
    });
    await expect(
      failing.get({ actor: admin, targetUserId: ownerId })
    ).rejects.toThrow("audit down");
  });
});
