import type { JobProcessor } from "@nitap/queue";

export type JobExpireCandidate = { id: string; postedBy: string };

/** The subset of `@nitap/database/jobs`'s `JobExpireStore` this processor needs. */
export type JobExpireStoreLike = {
  listExpirable(before: Date, limit: number): Promise<JobExpireCandidate[]>;
  expireOne(id: string, before: Date): Promise<boolean>;
};

/**
 * Flips overdue PUBLISHED jobs to EXPIRED in bounded batches (spec J-7, J-9), each row's flip and its
 * `job.expired` outbox event committed atomically by the store (`expireOne`). Modeled on `upload-sweep.ts`:
 * walks batches until a short one ends the run, so one large backlog cannot hold the job open past its
 * timeout, and `context.signal.aborted` is checked between batches so a shutdown stops promptly.
 */
export function createJobExpireProcessor(deps: {
  store: JobExpireStoreLike;
  batchSize?: number;
  now?: () => Date;
}): JobProcessor<{ v: 1 }> {
  const batchSize = deps.batchSize ?? 500;
  const now = deps.now ?? (() => new Date());

  return async (_payload, context) => {
    const today = now();
    const before = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
    );
    let expired = 0;

    while (!context.signal.aborted) {
      const batch = await deps.store.listExpirable(before, batchSize);
      if (batch.length === 0) break;

      for (const row of batch) {
        if (await deps.store.expireOne(row.id, before)) expired += 1;
      }
      if (batch.length < batchSize) break;
    }

    context.logger.info("job.expired.swept", { metadata: { expired } });
  };
}
