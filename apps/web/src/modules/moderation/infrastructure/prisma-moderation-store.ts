import type { Prisma, ReportStatus } from "@nitap/database";
import type { AuditWriter } from "@nitap/database/audit";
import type { OutboxWriter } from "@nitap/database/outbox";
import type { OutboxEvent } from "@nitap/jobs";

import type { TransactionRunner } from "@/infrastructure/database/transaction-runner";

import type { ReportTargetType } from "../domain/moderation";
import type {
  ModerationStore,
  ModerationTx,
  ReportRow,
  ReportView,
} from "../application/moderation-store";
import {
  findContentAuthor,
  hideMessageSql,
  reportTargetsSql,
  softDeleteContentSql,
} from "./sql";

const CONTENT_TARGET = {
  "post.removed": "post",
  "comment.removed": "comment",
  "message.hidden": "message",
} as const;

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
      const rows = await db.$queryRaw<ReportRow[]>`
        SELECT id, reporter_id AS "reporterId", target_type::text AS "targetType", target_id AS "targetId",
          reason, status::text AS status, resolved_by_id AS "resolvedById", created_at AS "createdAt"
        FROM "report" WHERE id = ${id}::uuid FOR UPDATE`;
      return rows[0] ?? null;
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
    async hideMessage(messageId) {
      return (await db.$executeRaw(hideMessageSql(messageId))) === 1;
    },
    async listReports({ reportId, statuses, targetType, after, take }) {
      const rows = await db.report.findMany({
        where: {
          AND: [
            reportId ? { id: reportId } : {},
            statuses.length ? { status: { in: [...statuses] } } : {},
            targetType ? { targetType } : {},
            after
              ? {
                  OR: [
                    { createdAt: { lt: after.createdAt } },
                    { createdAt: after.createdAt, id: { lt: after.id } },
                  ],
                }
              : {},
          ],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
        include: {
          reporter: { select: { id: true, name: true } },
          resolvedBy: { select: { id: true, name: true } },
        },
      });
      const ids: Record<ReportTargetType, string[]> = {
        POST: [],
        COMMENT: [],
        MESSAGE: [],
        USER: [],
      };
      for (const r of rows) ids[r.targetType].push(r.targetId);
      const targets = rows.length
        ? await db.$queryRaw<
            {
              type: ReportTargetType;
              id: string;
              ownerId: string;
              text: string | null;
              deleted: boolean;
            }[]
          >(reportTargetsSql(ids))
        : [];
      const byKey = new Map(targets.map((t) => [`${t.type}:${t.id}`, t]));
      return rows.map((r): ReportView => {
        const t = byKey.get(`${r.targetType}:${r.targetId}`);
        return {
          id: r.id,
          status: r.status,
          targetType: r.targetType,
          targetId: r.targetId,
          reason: r.reason,
          createdAt: r.createdAt,
          reporter: r.reporter,
          resolvedBy: r.resolvedBy,
          targetOwnerId: t?.ownerId ?? null,
          preview:
            t && r.targetType !== "MESSAGE"
              ? { text: t.text ?? "", deleted: t.deleted }
              : null,
        };
      });
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
              targetType: CONTENT_TARGET[entry.action],
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
                ...(entry.reason ? { reason: entry.reason } : {}),
              },
            }
      );
    },
  });

  return {
    transaction: (work) => deps.runner.run((db) => work(forClient(db))),
  };
}
