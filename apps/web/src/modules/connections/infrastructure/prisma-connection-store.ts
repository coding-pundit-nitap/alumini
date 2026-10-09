import type { Prisma } from "@nitap/database";
import type { AuditWriter } from "@nitap/database/audit";
import type { OutboxWriter } from "@nitap/database/outbox";

import type { TransactionRunner } from "@/infrastructure/database/transaction-runner";

import type {
  ConnectionStore,
  ConnectionTx,
} from "../application/connection-store";
import type { ConnectionRow } from "../domain/connection";

const toRow = (row: {
  id: string;
  userAId: string;
  userBId: string;
  requestedById: string;
  blockedById: string | null;
  state: ConnectionRow["state"];
  requestedAt: Date;
  respondedAt: Date | null;
}): ConnectionRow => ({ ...row });

/**
 * Pair uniqueness is enforced by the database (`uq_connection_pair`), never
 * read-then-write. State changes are guarded updates, and outbox events share
 * the transaction.
 */
export function createPrismaConnectionStore(deps: {
  runner: Pick<TransactionRunner, "run">;
  outbox: OutboxWriter;
  audit: AuditWriter;
}): ConnectionStore {
  const forClient = (db: Prisma.TransactionClient): ConnectionTx => ({
    async findByPair(userAId, userBId) {
      const row = await db.connection.findUnique({
        where: { userAId_userBId: { userAId, userBId } },
      });
      return row ? toRow(row) : null;
    },

    async findById(id) {
      const row = await db.connection.findUnique({ where: { id } });
      return row ? toRow(row) : null;
    },

    async accountState(userId) {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { accountState: true },
      });
      return user?.accountState ?? null;
    },

    async insert(input) {
      const { count } = await db.connection.createMany({
        data: [input],
        skipDuplicates: true,
      });
      if (count === 0) return null;
      const row = await db.connection.findUnique({
        where: {
          userAId_userBId: { userAId: input.userAId, userBId: input.userBId },
        },
      });
      return row ? toRow(row) : null;
    },

    async update(id, from, patch) {
      const { count } = await db.connection.updateMany({
        where: { id, state: from },
        data: patch,
      });
      if (count === 0) return null;
      const row = await db.connection.findUnique({ where: { id } });
      return row ? toRow(row) : null;
    },

    async remove(id, from) {
      const { count } = await db.connection.deleteMany({
        where: { id, state: from },
      });
      return count === 1;
    },

    async enqueue(event) {
      await deps.outbox.add(db, event);
    },

    async audit(entry) {
      await deps.audit.record(db, {
        actorId: entry.actorId,
        action: entry.action,
        targetType: "user",
        targetId: entry.targetUserId,
        metadata: { connectionId: entry.connectionId },
      });
    },
  });

  return {
    transaction: (work) => deps.runner.run((db) => work(forClient(db))),
  };
}
