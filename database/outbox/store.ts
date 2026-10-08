import type {
  OutboxEventRow,
  OutboxQuarantinedRow,
  OutboxStore,
} from "@nitap/jobs";

import type { PrismaClient } from "../generated/prisma/client.ts";

export type OutboxStoreOptions = {
  /** Upper bound for one relay transaction (it holds row locks while it enqueues). */
  transactionTimeoutMs?: number;
};

/** Quarantined rows are left alone: they were never processed, and the operator releases them explicitly. */
const settleable = (before: Date, type?: string) => ({
  publishedAt: null,
  failedAt: null,
  createdAt: { lt: before },
  ...(type ? { type } : {}),
});

export function createOutboxStore(
  prisma: PrismaClient,
  options: OutboxStoreOptions = {}
): OutboxStore {
  const timeout = options.transactionTimeoutMs ?? 30_000;

  return {
    publishBatch(limit, knownTypes, publish) {
      return prisma.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<OutboxEventRow[]>`
            SELECT id::text AS id, type, payload,
                   request_id AS "requestId", created_at AS "createdAt"
            FROM outbox_event
            WHERE published_at IS NULL
              AND failed_at IS NULL
              AND type = ANY(${[...knownTypes]}::text[])
            ORDER BY created_at
            LIMIT ${limit}
            FOR UPDATE SKIP LOCKED`;
          if (rows.length === 0) return 0;

          const result = await publish(rows);

          if (result.published.length > 0) {
            await tx.$executeRaw`
              UPDATE outbox_event SET published_at = now()
              WHERE id = ANY(${[...result.published]}::uuid[])`;
          }
          for (const item of result.quarantined) {
            await tx.$executeRaw`
              UPDATE outbox_event
              SET failed_at = now(), failure_reason = ${item.reason.slice(0, 500)}
              WHERE id = ${item.id}::uuid`;
          }
          return rows.length;
        },
        { timeout, maxWait: 5_000 }
      );
    },

    async oldestUnpublishedAgeSeconds() {
      const [row] = await prisma.$queryRaw<{ age: number | null }[]>`
        SELECT EXTRACT(EPOCH FROM (now() - min(created_at)))::float8 AS age
        FROM outbox_event
        WHERE published_at IS NULL AND failed_at IS NULL`;
      return row?.age ?? null;
    },

    async pruneBefore(cutoff, limit) {
      return prisma.$executeRaw`
        DELETE FROM outbox_event
        WHERE id IN (
          SELECT id FROM outbox_event
          WHERE published_at < ${cutoff}
          ORDER BY published_at
          LIMIT ${limit})`;
    },

    async listQuarantined(limit) {
      const rows = await prisma.outboxEvent.findMany({
        where: { failedAt: { not: null } },
        orderBy: { failedAt: "asc" },
        take: limit,
        select: { id: true, type: true, failedAt: true, failureReason: true },
      });
      return rows.map((row): OutboxQuarantinedRow => ({
        id: row.id,
        type: row.type,
        failedAt: row.failedAt as Date,
        failureReason: row.failureReason as string,
      }));
    },

    async releaseQuarantined(ids) {
      const result = await prisma.outboxEvent.updateMany({
        where: {
          failedAt: { not: null },
          ...(ids ? { id: { in: [...ids] } } : {}),
        },
        data: { failedAt: null, failureReason: null },
      });
      return result.count;
    },

    countReplayable(since, type) {
      return prisma.outboxEvent.count({
        where: { publishedAt: { gte: since }, ...(type ? { type } : {}) },
      });
    },

    async replay(since, type) {
      const result = await prisma.outboxEvent.updateMany({
        where: { publishedAt: { gte: since }, ...(type ? { type } : {}) },
        data: { publishedAt: null },
      });
      return result.count;
    },

    countSettleable(before, type) {
      return prisma.outboxEvent.count({
        where: settleable(before, type),
      });
    },

    async settle(before, type) {
      const result = await prisma.outboxEvent.updateMany({
        where: settleable(before, type),
        data: { publishedAt: new Date() },
      });
      return result.count;
    },
  };
}
