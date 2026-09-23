import type { NotificationRetentionSweepPayload } from "@nitap/jobs";
import type { JobProcessor } from "@nitap/queue";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Spec N-15: read notifications older than 90 days go, in bounded batches until a short one. */
export function createNotificationRetentionSweepProcessor(deps: {
  sweep: (before: Date, limit: number) => Promise<number>;
  retentionDays?: number;
  batchSize?: number;
  now?: () => Date;
}): JobProcessor<NotificationRetentionSweepPayload> {
  const retentionMs = (deps.retentionDays ?? 90) * DAY_MS;
  const batchSize = deps.batchSize ?? 500;
  const now = deps.now ?? (() => new Date());

  return async (_payload, { signal, logger }) => {
    const before = new Date(now().getTime() - retentionMs);
    let removed = 0;
    while (!signal.aborted) {
      const batch = await deps.sweep(before, batchSize);
      removed += batch;
      if (batch < batchSize) break;
    }
    logger.info("notification.retention-swept", { metadata: { removed } });
  };
}
