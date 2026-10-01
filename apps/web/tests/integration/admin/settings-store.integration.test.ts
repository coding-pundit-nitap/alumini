import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAuditWriter } from "@nitap/database/audit";
import { createNotificationRetentionStore } from "@nitap/database/notifications";
import { RETENTION_CATALOGUE } from "@nitap/database/retention";
import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createTransactionRunner } from "@/infrastructure/database/transaction-runner";
import {
  createListRetentionSettings,
  createUpdateRetentionSetting,
} from "@/modules/admin";
import type { Actor } from "@/modules/auth";
import { createPrismaSettingsStore } from "@/modules/admin/server";

describe("retention settings (12G)", () => {
  let db: TestDatabase;
  let actor: Actor;

  const useCases = () => {
    const deps = {
      store: createPrismaSettingsStore({
        db: db.prisma,
        runner: createTransactionRunner(db.prisma),
        audit: createAuditWriter(),
      }),
      authorize: (a: Actor | null) => a!,
      catalogue: RETENTION_CATALOGUE,
    };
    return {
      list: createListRetentionSettings(deps),
      update: createUpdateRetentionSetting(deps),
    };
  };

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    const admin = await db.prisma.user.create({
      data: { name: "Admin", email: "admin@example.test" },
    });
    actor = {
      userId: admin.id,
      accountState: "VERIFIED",
      requestId: "r",
      grants: [],
    };
  });
  afterEach(() => db.drop());

  it("the seed creates every category as a placeholder, and a re-run keeps an edited value", async () => {
    const { list, update } = useCases();
    const rows = await list({ actor });
    expect(
      rows.map((r) => [r.category, r.retentionDays, r.approvedBy])
    ).toEqual([
      ["notifications", 90, null],
      ["deactivated_accounts", 90, null],
      ["deleted_content", 30, null],
      ["reports", 365, null],
      ["audit_logs", 365, null],
      ["donation_records", 2555, null],
    ]);

    await update({
      actor,
      category: "reports",
      input: { retentionDays: 400 },
    });
    await runSeed(db.prisma);
    expect(
      (
        await db.prisma.retentionSetting.findUniqueOrThrow({
          where: { category: "reports" },
        })
      ).retentionDays
    ).toBe(400);
  });

  it("an update records who changed it and writes config.changed in the same transaction", async () => {
    const { list, update } = useCases();
    await update({
      actor,
      category: "notifications",
      input: { retentionDays: 120, approvedBy: "Registrar, 2026-10-01" },
    });

    const notifications = (await list({ actor }))[0]!;
    expect(notifications).toMatchObject({
      category: "notifications",
      retentionDays: 120,
      approvedBy: "Registrar, 2026-10-01",
      updatedBy: { id: actor.userId, name: "Admin" },
    });
    const audits = await db.prisma.auditLog.findMany({
      where: { action: "config.changed" },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorId: actor.userId,
      targetType: "retention_setting",
      targetId: notifications.id,
      metadata: {
        key: "notifications",
        from: { retentionDays: 90, approved: false },
        to: { retentionDays: 120, approved: true },
      },
    });

    // Same values again: no write, no second audit row.
    await update({
      actor,
      category: "notifications",
      input: { retentionDays: 120, approvedBy: "Registrar, 2026-10-01" },
    });
    expect(
      await db.prisma.auditLog.count({ where: { action: "config.changed" } })
    ).toBe(1);
  });

  it("the notification sweep reads the configured period, and 90 when the row is missing", async () => {
    const retention = createNotificationRetentionStore();
    expect(await retention.retentionDays(db.prisma)).toBe(90);
    await useCases().update({
      actor,
      category: "notifications",
      input: { retentionDays: 30 },
    });
    expect(await retention.retentionDays(db.prisma)).toBe(30);
    await db.prisma.retentionSetting.delete({
      where: { category: "notifications" },
    });
    expect(await retention.retentionDays(db.prisma)).toBe(90);
  });
});
