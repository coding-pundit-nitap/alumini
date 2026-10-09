import { QUEUES } from "@nitap/jobs";
import type { QueueName } from "@nitap/jobs";
import type { PrometheusMetrics } from "@nitap/observability";
import type { QueueAdmin } from "@nitap/queue";

/**
 * Samples BullMQ job counts at scrape time, so the series is fresh and still moves while
 * the processors are stopped. A queue Redis failure is counted by the adapter and never blanks the scrape.
 */
export function registerQueueDepthCollector(
  metrics: PrometheusMetrics,
  admin: Pick<QueueAdmin, "jobCounts">
): void {
  metrics.onCollect("queue_depth", async () => {
    const names = Object.keys(QUEUES) as QueueName[];
    const all = await Promise.all(
      names.map(async (queue) => [queue, await admin.jobCounts(queue)] as const)
    );
    for (const [queue, counts] of all) {
      for (const [state, value] of Object.entries(counts)) {
        metrics.gauge("queue_jobs", value, { queue, state });
      }
    }
  });
}
