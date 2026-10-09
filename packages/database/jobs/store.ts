import type { OutboxWriter } from "../outbox/writer.ts";
import type { PrismaClient } from "../generated/prisma/client.ts";

export type JobExpireCandidate = { id: string; postedBy: string };

/**
 * Shared between `@nitap/database` consumers and the worker's `job.expire` processor, the same
 * relationship `uploads/store.ts` has to the upload sweep. `expireOne` is a guarded UPDATE plus the
 * `job.expired` outbox event, in ONE transaction: a crash between the row flip and its
 * event cannot happen, and a row that already left PUBLISHED (closed, edited back, or already expired) is
 * a harmless no-op — the same idempotency shape as `uploadSweep`.
 */
export type JobExpireStore = {
  /** PUBLISHED rows whose deadline is before `before` (a UTC-midnight cutoff), oldest deadline first. */
  listExpirable(before: Date, limit: number): Promise<JobExpireCandidate[]>;
  /** True if this row was still PUBLISHED and is now EXPIRED; false if it had already moved. */
  expireOne(id: string, before: Date): Promise<boolean>;
};

export function createJobExpireStore(deps: {
  prisma: PrismaClient;
  outbox: OutboxWriter;
}): JobExpireStore {
  return {
    async listExpirable(before, limit) {
      return deps.prisma.job.findMany({
        where: { status: "PUBLISHED", deadline: { lt: before } },
        orderBy: { deadline: "asc" },
        take: limit,
        select: { id: true, postedBy: true },
      });
    },

    async expireOne(id, before) {
      return deps.prisma.$transaction(async (tx) => {
        const { count } = await tx.job.updateMany({
          where: { id, status: "PUBLISHED", deadline: { lt: before } },
          data: { status: "EXPIRED" },
        });
        if (count === 0) return false;
        const row = await tx.job.findUniqueOrThrow({
          where: { id },
          select: { postedBy: true },
        });
        await deps.outbox.add(tx, {
          type: "job.expired",
          payload: { v: 1, jobId: id, postedBy: row.postedBy },
        });
        return true;
      });
    },
  };
}
