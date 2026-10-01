import type { JobProcessor } from "@nitap/queue";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The subset of `@nitap/database/donations`'s `PledgeExpiryStore` this processor needs. */
export type PledgeExpiryStoreLike = {
  listStale(before: Date, limit: number): Promise<{ id: string }[]>;
  expireOne(id: string, before: Date, now: Date): Promise<boolean>;
};

/**
 * Spec H-8: open pledges with no payment reference after `days` become NOT_RECEIVED, in bounded batches
 * until a short one (modeled on `job-expire.ts`). Each flip and its donor notice commit together in the store.
 */
export function createDonationExpireProcessor(deps: {
  store: PledgeExpiryStoreLike;
  days?: number;
  batchSize?: number;
  now?: () => Date;
}): JobProcessor<{ v: 1 }> {
  const days = deps.days ?? 30;
  const batchSize = deps.batchSize ?? 500;
  const now = deps.now ?? (() => new Date());

  return async (_payload, context) => {
    const at = now();
    const before = new Date(at.getTime() - days * DAY_MS);
    let expired = 0;
    while (!context.signal.aborted) {
      const batch = await deps.store.listStale(before, batchSize);
      for (const row of batch)
        if (await deps.store.expireOne(row.id, before, at)) expired += 1;
      if (batch.length < batchSize) break;
    }
    context.logger.info("donation.pledges-expired", { metadata: { expired } });
  };
}
