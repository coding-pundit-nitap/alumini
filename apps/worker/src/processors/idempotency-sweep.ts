import type { IdempotencySweepPayload } from "@nitap/jobs";
import type { JobProcessor } from "@nitap/queue";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Deletes `Idempotency-Key` rows past their 24 h retention in bounded batches, until a short one ends the
 * run, so a large backlog cannot hold the job open past its timeout. Web already treats an expired row as
 * absent, so this only reclaims space.
 */
export function createIdempotencySweepProcessor(deps: {
  sweep: (before: Date, limit: number) => Promise<number>;
  olderThanMs?: number;
  batchSize?: number;
  now?: () => Date;
}): JobProcessor<IdempotencySweepPayload> {
  const olderThanMs = deps.olderThanMs ?? DAY_MS;
  const batchSize = deps.batchSize ?? 1_000;
  const now = deps.now ?? (() => new Date());

  return async (_payload, { signal, logger }) => {
    const before = new Date(now().getTime() - olderThanMs);
    let removed = 0;
    while (!signal.aborted) {
      const batch = await deps.sweep(before, batchSize);
      removed += batch;
      if (batch < batchSize) break;
    }
    logger.info("idempotency.swept", { metadata: { removed } });
  };
}
