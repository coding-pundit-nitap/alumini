import type { Prisma, ReportStatus } from "@nitap/database";
import type { AuditWriter } from "@nitap/database/audit";
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
  audit: AuditWriter;
}): ModerationStore {
  const forClient = (db: Prisma.TransactionClient): ModerationTx => ({
    async contentAuthor(targetType, targetId) {
      const rows = await db.$queryRaw<{ authorId: string }[]>(
        findContentAuthor(targetType, targetId)
      );
      return rows[0]?.authorId ?? null;
    },
    async insertReport({ reporterId, targetType, targetId, reason }) {
      const { count } = await db.report.createMany({
        data: [{ reporterId, targetType, targetId, reason }],
        skipDuplicates: true,
      });
      const row = await db.report.findUniqueOrThrow({
        where: {
          reporterId_targetType_targetId: { reporterId, targetType, targetId },
        },
        select: { id: true },
      });
      return { id: row.id, created: count === 1 };
    },
    async findReport(id) {
      const row = await db.report.findFirst({
        where: { id, targetType: { in: ["POST", "COMMENT"] } },
      });
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
    async audit(entry) {
      await deps.audit.record(
        db,
        "contentId" in entry
          ? {
              actorId: entry.actorId,
              action: entry.action,
              targetType: entry.action === "post.removed" ? "post" : "comment",
              targetId: entry.contentId,
              metadata: { reportId: entry.reportId },
            }
          : {
              actorId: entry.actorId,
              action: entry.action,
              targetType: "report",
              targetId: entry.reportId,
              metadata: {
                targetType: entry.targetType,
                targetId: entry.targetId,
              },
            }
      );
    },
  });

  return {
    transaction: (work) => deps.runner.run((db) => work(forClient(db))),
  };
}
