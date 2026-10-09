import type { OutboxWriter } from "../outbox/writer.ts";
import type { PrismaClient } from "../generated/prisma/client.ts";

export type StalePledge = { id: string };

/** Each flip and its `donation.not-received` event commit together; a row that already moved is a no-op. */
export type PledgeExpiryStore = {
  /** PLEDGED rows with no reference created before `before`, oldest first. */
  listStale(before: Date, limit: number): Promise<StalePledge[]>;
  /** True if this row was still a stale open pledge and is now NOT_RECEIVED (note "expired"). */
  expireOne(id: string, before: Date, now: Date): Promise<boolean>;
};

const stale = (before: Date) => ({
  status: "PLEDGED" as const,
  paymentReference: null,
  createdAt: { lt: before },
});

export function createPledgeExpiryStore(deps: {
  prisma: PrismaClient;
  outbox: OutboxWriter;
}): PledgeExpiryStore {
  return {
    async listStale(before, limit) {
      return deps.prisma.donation.findMany({
        where: stale(before),
        orderBy: { createdAt: "asc" },
        take: limit,
        select: { id: true },
      });
    },

    async expireOne(id, before, now) {
      return deps.prisma.$transaction(async (tx) => {
        const { count } = await tx.donation.updateMany({
          where: { id, ...stale(before) },
          data: { status: "NOT_RECEIVED", note: "expired", decidedAt: now },
        });
        if (count === 0) return false;
        const row = await tx.donation.findUniqueOrThrow({
          where: { id },
          select: { campaignId: true, donorId: true },
        });
        await deps.outbox.add(tx, {
          type: "donation.not-received",
          payload: { v: 1, donationId: id, ...row },
        });
        return true;
      });
    },
  };
}
