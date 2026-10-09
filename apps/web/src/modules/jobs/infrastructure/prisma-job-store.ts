import { Prisma } from "@nitap/database";
import type { AuditWriter } from "@nitap/database/audit";
import type { OutboxWriter } from "@nitap/database/outbox";

import type { TransactionRunner } from "@/infrastructure/database/transaction-runner";

import type { JobStore, JobTx } from "../application/job-store";
import type { JobRow } from "../domain/job";

const toRow = (r: JobRow): JobRow => ({ ...r, skills: [...r.skills] });

/**
 * State changes are `UPDATE … WHERE status = <expected>`; zero rows means the
 * row already moved. The outbox event shares the transaction.
 */
export function createPrismaJobStore(deps: {
  runner: Pick<TransactionRunner, "run">;
  outbox: OutboxWriter;
  audit: AuditWriter;
}): JobStore {
  const forClient = (db: Prisma.TransactionClient): JobTx => ({
    async findById(id) {
      const row = await db.job.findUnique({ where: { id } });
      return row ? toRow(row) : null;
    },

    async insert(input) {
      const row = await db.job.create({ data: input });
      return toRow(row);
    },

    async update(id, from, patch) {
      const { count } = await db.job.updateMany({
        where: { id, status: from },
        data: patch,
      });
      if (count === 0) return null;
      const row = await db.job.findUnique({ where: { id } });
      return row ? toRow(row) : null;
    },

    async enqueue(event) {
      await deps.outbox.add(db, event);
    },

    async audit(entry) {
      await deps.audit.record(db, {
        actorId: entry.actorId,
        action: entry.action,
        targetType: "job",
        targetId: entry.jobId,
        metadata:
          entry.action === "job.publish_direct"
            ? {}
            : { postedBy: entry.postedBy },
      });
    },
  });

  return {
    transaction: (work) => deps.runner.run((db) => work(forClient(db))),
  };
}
