import type { OutboxStore } from "@nitap/jobs";
import type { JobProcessor } from "@nitap/queue";

export type OutboxPruneOptions = {
  /** ADR-007: published rows are a delivery buffer, kept 7 days. */
  retentionDays?: number;
  batchSize?: number;
  now?: () => Date;
};

/** Deletes published rows older than the retention window in bounded batches, until a short batch. */
export function createOutboxPruneProcessor(
  store: OutboxStore,
  options: OutboxPruneOptions = {}
): JobProcessor<{ v: 1 }> {
  const {
    retentionDays = 7,
    batchSize = 1_000,
    now = () => new Date(),
  } = options;
  return async (_payload, { signal, logger }) => {
    const cutoff = new Date(
      now().getTime() - retentionDays * 24 * 60 * 60 * 1000
    );
    let deleted = 0;
    while (!signal.aborted) {
      const batch = await store.pruneBefore(cutoff, batchSize);
      deleted += batch;
      if (batch < batchSize) break;
    }
    logger.info("outbox.pruned", { metadata: { deleted, retentionDays } });
  };
}
