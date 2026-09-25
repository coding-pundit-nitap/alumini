import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAuditWriter } from "@nitap/database/audit";
import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createPrismaAdminStore } from "@/modules/admin/infrastructure/prisma-admin-store";

describe("PrismaAdminStore against real PostgreSQL", () => {
  let db: TestDatabase;
  let actorId: string;
  let otherId: string;
  let baseline: { verified: number; pending: number; recent: number };

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    baseline = {
      verified: await db.prisma.user.count({
        where: { accountState: "VERIFIED" },
      }),
      pending: await db.prisma.user.count({
        where: { accountState: "PENDING" },
      }),
      recent: await db.prisma.user.count({
        where: { createdAt: { gte: weekAgo } },
      }),
    };
    const mk = (name: string, accountState: "VERIFIED" | "PENDING") =>
      db.prisma.user.create({
        data: { name, email: `${name}@example.test`, accountState },
      });
    actorId = (await mk("admin", "VERIFIED")).id;
    otherId = (await mk("pending", "PENDING")).id;
  });
  afterEach(async () => {
    await db.drop();
  });

  it("pages rows that share created_at without skipping or repeating", async () => {
    const writer = createAuditWriter();
    // One transaction: every row gets the same now().
    await db.prisma.$transaction(async (tx) => {
      for (let i = 0; i < 5; i++) {
        await writer.record(tx, {
          actorId,
          action: "job.approved",
          targetType: "job",
          targetId: otherId,
        });
      }
    });
    const store = createPrismaAdminStore(db.prisma);
    const seen: string[] = [];
    let after: { createdAt: Date; id: string } | null = null;
    for (let page = 0; page < 5; page++) {
      const rows = await store.listAuditLog({ filter: {}, after, take: 3 });
      const pageRows = rows.slice(0, 2);
      seen.push(...pageRows.map((r) => r.id));
      if (rows.length <= 2) break;
      after = { createdAt: pageRows[1]!.createdAt, id: pageRows[1]!.id };
    }
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
  });

  it("filters by actor, action, target and an exclusive time range, joining the actor", async () => {
    const writer = createAuditWriter();
    await writer.record(db.prisma, {
      actorId,
      action: "job.approved",
      targetType: "job",
      targetId: otherId,
    });
    await writer.record(db.prisma, {
      actorId,
      action: "report.dismissed",
      targetType: "report",
      targetId: otherId,
    });
    const store = createPrismaAdminStore(db.prisma);
    const list = (filter: Parameters<typeof store.listAuditLog>[0]["filter"]) =>
      store.listAuditLog({ filter, after: null, take: 10 });

    const byAction = await list({ action: "report.dismissed" });
    expect(byAction.map((r) => r.action)).toEqual(["report.dismissed"]);
    expect(byAction[0]!.actor).toEqual({
      id: actorId,
      name: "admin",
      email: "admin@example.test",
    });

    expect(await list({ targetType: "job", targetId: otherId })).toHaveLength(
      1
    );
    expect(await list({ actorId })).toHaveLength(2);
    expect(await list({ actorId: otherId })).toEqual([]);
    expect(await list({ from: new Date(Date.now() + 60_000) })).toEqual([]);
    const rows = await list({});
    const newest = rows[0]!.createdAt;
    expect(await list({ to: newest })).toHaveLength(
      rows.filter((r) => r.createdAt < newest).length
    );
  });

  it("counts each tile from its own table", async () => {
    const store = createPrismaAdminStore(db.prisma);
    expect(await store.countTile("members", new Date())).toEqual({
      byState: expect.objectContaining({
        VERIFIED: baseline.verified + 1,
        PENDING: baseline.pending + 1,
      }),
      newLast7Days: baseline.recent + 2,
    });
    for (const key of [
      "pendingJobs",
      "openReports",
      "pendingVerifications",
      "pendingAchievements",
      "failedEmails",
    ] as const) {
      expect(await store.countTile(key, new Date())).toBe(0);
    }
  });

  it("counts a pending job and an open report", async () => {
    await db.prisma.job.create({
      data: {
        postedBy: actorId,
        title: "Engineer",
        company: "Acme",
        description: "Build things",
        location: "Remote",
        employmentType: "FULL_TIME",
        workMode: "REMOTE",
        experience: "2 years",
        applicationUrl: "https://example.test/apply",
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: "PENDING_REVIEW",
      },
    });
    await db.prisma.report.create({
      data: {
        reporterId: otherId,
        targetType: "USER",
        targetId: actorId,
        reason: "spam",
      },
    });
    const store = createPrismaAdminStore(db.prisma);
    expect(await store.countTile("pendingJobs", new Date())).toBe(1);
    expect(await store.countTile("openReports", new Date())).toBe(1);
  });

  it("lists users by substring, literally, case-insensitive, keyset-paged", async () => {
    const base = Date.now();
    const mkUser = (
      name: string,
      offsetMs: number,
      accountState: "VERIFIED" | "SUSPENDED" = "VERIFIED"
    ) =>
      db.prisma.user.create({
        data: {
          name,
          email: `${name.toLowerCase().replace(/[^a-z0-9]/g, "")}@example.test`,
          accountState,
          createdAt: new Date(base + offsetMs),
        },
      });
    const giveRole = async (userId: string, role: string) => {
      const { id: roleId } = await db.prisma.role.findUniqueOrThrow({
        where: { name: role },
      });
      await db.prisma.userRole.create({
        data: { userId, roleId, grantedBy: actorId },
      });
    };

    const ann = await mkUser("Ann", 0);
    const anna = await mkUser("anna", 1_000);
    const bob = await mkUser("Bob", 2_000);
    const percent = await mkUser("50%_off", 3_000);
    const mid = await mkUser("joanna", 3_500);
    const sue = await mkUser("Sue", 4_000, "SUSPENDED");
    const stan = await mkUser("Stan", 5_000);
    await giveRole(stan.id, "STAFF");
    // Three rows sharing created_at, latest in the ordering. With take=2 the first two (by id desc)
    // land on page 1 and the third is the sole entry on page 2, so the second page's cursor query
    // MUST use the `createdAt = after.createdAt AND id < after.id` branch (not just `createdAt <`)
    // to find it — a tie split cleanly inside one page (e.g. both on page 1) would never exercise it.
    const zed1 = await mkUser("Zed1", 6_000);
    const zed2 = await mkUser("Zed2", 6_000);
    const zed3 = await mkUser("Zed3", 6_000);

    const store = createPrismaAdminStore(db.prisma);
    const list = (filter: Parameters<typeof store.listUsers>[0]["filter"]) =>
      store.listUsers({ filter, after: null, take: 50 });

    const byAn = await list({ q: "an" });
    expect(new Set(byAn.map((u) => u.id))).toEqual(
      new Set([ann.id, anna.id, mid.id, stan.id])
    );

    const byMid = await list({ q: "ANN" }); // matches ann, anna, joanna (middle of the name)
    expect(new Set(byMid.map((u) => u.id))).toEqual(
      new Set([ann.id, anna.id, mid.id])
    );
    const byDomain = await list({ q: "example.test" }); // middle of the email
    expect(byDomain.length).toBeGreaterThan(0);

    const byPercent = await list({ q: "50%" });
    expect(byPercent.map((u) => u.id)).toEqual([percent.id]);

    expect((await list({ q: "_" })).map((u) => u.id)).toEqual([percent.id]); // literal underscore; as a LIKE wildcard it would match every user
    expect((await list({ q: "%" })).map((u) => u.id)).toEqual([percent.id]);

    const byState = await list({ state: "SUSPENDED" });
    expect(byState.map((u) => u.id)).toEqual([sue.id]);

    const byRole = await list({ role: "STAFF" });
    expect(byRole.map((u) => u.id)).toEqual([stan.id]);

    // Keyset paging over all 9 rows: take=2 at a time, no gaps or repeats, including a created_at
    // tie split across a page boundary (zed1/zed2/zed3, see above).
    // actorId/otherId are created in beforeEach and also show up in an unfiltered listing.
    const allIds = [
      ann.id,
      anna.id,
      bob.id,
      percent.id,
      mid.id,
      sue.id,
      stan.id,
      zed1.id,
      zed2.id,
      zed3.id,
      actorId,
      otherId,
    ];
    const seen: string[] = [];
    let after: { createdAt: Date; id: string } | null = null;
    for (let page = 0; page < 10; page++) {
      const rows = await store.listUsers({ filter: {}, after, take: 2 });
      if (rows.length === 0) break;
      seen.push(...rows.map((r) => r.id));
      const last = rows[rows.length - 1]!;
      after = { createdAt: last.createdAt, id: last.id };
    }
    expect(seen).toHaveLength(allIds.length);
    expect(new Set(seen).size).toBe(allIds.length);
    expect(new Set(seen)).toEqual(new Set(allIds));
  });

  it("getUser returns roles, grants with chapter slug and granter, and isLastSuperAdmin", async () => {
    const giveRole = async (userId: string, role: string) => {
      const { id: roleId } = await db.prisma.role.findUniqueOrThrow({
        where: { name: role },
      });
      await db.prisma.userRole.create({
        data: { userId, roleId, grantedBy: actorId },
      });
    };
    const store = createPrismaAdminStore(db.prisma);

    const solo = await db.prisma.user.create({
      data: {
        name: "solo",
        email: "solo@example.test",
        accountState: "VERIFIED",
      },
    });
    await giveRole(solo.id, "SUPER_ADMIN");
    const chapter = await db.prisma.chapter.create({
      data: { slug: "ny-chapter" },
    });
    await db.prisma.permissionGrant.create({
      data: {
        userId: solo.id,
        permission: "event.manage",
        scopeType: "CHAPTER",
        chapterId: chapter.id,
        grantedBy: actorId,
      },
    });

    const solo1 = await store.getUser(solo.id, "SUPER_ADMIN");
    expect(solo1).toMatchObject({
      id: solo.id,
      name: "solo",
      email: "solo@example.test",
      accountState: "VERIFIED",
      isLastSuperAdmin: true,
    });
    expect(solo1!.roles).toEqual([
      {
        name: "SUPER_ADMIN",
        grantedAt: expect.any(Date),
        grantedBy: { id: actorId, name: "admin" },
      },
    ]);
    expect(solo1!.grants).toEqual([
      {
        id: expect.any(String),
        permission: "event.manage",
        scope: "CHAPTER",
        chapterId: chapter.id,
        chapterSlug: "ny-chapter",
        grantedAt: expect.any(Date),
        expiresAt: null,
        grantedBy: { id: actorId, name: "admin" },
      },
    ]);

    const second = await db.prisma.user.create({
      data: {
        name: "second",
        email: "second@example.test",
        accountState: "VERIFIED",
      },
    });
    await giveRole(second.id, "SUPER_ADMIN");
    const solo2 = await store.getUser(solo.id, "SUPER_ADMIN");
    expect(solo2!.isLastSuperAdmin).toBe(false);

    expect(
      await store.getUser("00000000-0000-4000-8000-000000000000", "SUPER_ADMIN")
    ).toBeNull();
  });
});
