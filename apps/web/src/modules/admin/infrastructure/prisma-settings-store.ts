import type { Prisma, PrismaClient } from "@nitap/database";
import type { AuditWriter } from "@nitap/database/audit";

import type { TransactionRunner } from "@/infrastructure/database/transaction-runner";

import type { SettingsStore, SettingsTx } from "../application/admin-store";

/** 12G G-1/G-4: `retention_setting` reads, and locked writes audited in the same transaction. */
export function createPrismaSettingsStore(deps: {
  db: PrismaClient;
  runner: Pick<TransactionRunner, "run">;
  audit: AuditWriter;
}): SettingsStore {
  const forClient = (db: Prisma.TransactionClient): SettingsTx => ({
    async findForUpdate(category) {
      const rows = await db.$queryRaw<
        { id: string; retention_days: number; approved_by: string | null }[]
      >`
        SELECT id, retention_days, approved_by FROM retention_setting
         WHERE category = ${category} FOR UPDATE`;
      const row = rows[0];
      return row
        ? {
            id: row.id,
            retentionDays: row.retention_days,
            approvedBy: row.approved_by,
          }
        : null;
    },

    async update(id, values, actorId) {
      await db.retentionSetting.update({
        where: { id },
        data: { ...values, updatedBy: actorId, updatedAt: new Date() },
      });
    },

    async audit({ actorId, targetId, metadata }) {
      await deps.audit.record(db, {
        action: "config.changed",
        actorId,
        targetType: "retention_setting",
        targetId,
        metadata,
      });
    },
  });

  return {
    async listRetention() {
      const rows = await deps.db.retentionSetting.findMany({
        include: { updater: { select: { id: true, name: true } } },
      });
      return rows.map((r) => ({
        id: r.id,
        category: r.category,
        retentionDays: r.retentionDays,
        approvedBy: r.approvedBy,
        updatedAt: r.updatedAt,
        updatedBy: r.updater,
      }));
    },
    transaction: (work) => deps.runner.run((db) => work(forClient(db))),
  };
}
