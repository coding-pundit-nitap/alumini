import type { Prisma, ReportStatus } from "@nitap/database";
import type { OutboxWriter } from "@nitap/database/outbox";
import type { OutboxEvent } from "@nitap/jobs";

import type { TransactionRunner } from "@/infrastructure/database/transaction-runner";

import type {
  ModerationStore,
  ModerationTx,
  ReportRow,
} from "../application/moderation-store";
import { findContentAuthor, softDeleteContentSql } from "./sql";

export function createPrismaModerationStore(deps: {
  runner: Pick<TransactionRunner, "run">;
  outbox: OutboxWriter;
}): ModerationStore {
  const forClient = (db: Prisma.TransactionClient): ModerationTx => ({
    async contentAuthor(targetType, targetId) {
      const rows = await db.$queryRaw<{ authorId: string }[]>(
        findContentAuthor(targetType, targetId)
      );
      return rows[0]?.authorId ?? null;
    },
    async insertReport({ reporterId, targetType, targetId, reason }) {
      const existing = await db.report.findUnique({
        where: {
          reporterId_targetType_targetId: { reporterId, targetType, targetId },
        },
      });
      if (existing) return { id: existing.id, created: false };
      const created = await db.report.create({
        data: { reporterId, targetType, targetId, reason },
      });
      return { id: created.id, created: true };
    },
    async findReport(id) {
      const row = await db.report.findUnique({ where: { id } });
      return row as ReportRow | null;
    },
    async patchReport(id, patch) {
      await db.report.update({
        where: { id },
        data: { ...patch, status: patch.status as ReportStatus },
      });
    },
    async softDeleteContent(targetType, targetId) {
      await db.$executeRaw(softDeleteContentSql(targetType, targetId));
    },
    async enqueue(event) {
      await deps.outbox.add(db, event as OutboxEvent);
    },
  });

  return {
    transaction: (work) => deps.runner.run((db) => work(forClient(db))),
  };
}
