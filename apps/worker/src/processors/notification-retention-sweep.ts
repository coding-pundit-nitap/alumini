import type { NotificationRetentionSweepPayload } from "@nitap/jobs";
import type { JobProcessor } from "@nitap/queue";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Read notifications older than the retention period go, in bounded batches until a short one.
 * The period is read at the start of every run, so an admin's change applies from the next run.
 */
export function createNotificationRetentionSweepProcessor(deps: {
  sweep: (before: Date, limit: number) => Promise<number>;
  retentionDays?: () => Promise<number>;
  batchSize?: number;
  now?: () => Date;
}): JobProcessor<NotificationRetentionSweepPayload> {
  const retentionDays = deps.retentionDays ?? (async () => 90);
  const batchSize = deps.batchSize ?? 500;
  const now = deps.now ?? (() => new Date());

  return async (_payload, { signal, logger }) => {
    const days = await retentionDays();
    const before = new Date(now().getTime() - days * DAY_MS);
    let removed = 0;
    while (!signal.aborted) {
      const batch = await deps.sweep(before, batchSize);
      removed += batch;
      if (batch < batchSize) break;
    }
    logger.info("notification.retention-swept", {
      metadata: { removed, retentionDays: days },
    });
  };
}
