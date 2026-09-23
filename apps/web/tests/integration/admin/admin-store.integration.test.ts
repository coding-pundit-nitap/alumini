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
});
