import type { PrometheusMetrics } from "@nitap/observability";
import type { UploadStore, UploadTransaction } from "@nitap/database/uploads";

/**
 * Samples the upload scan backlog at scrape time, so the age keeps rising while the
 * scanner or the worker's processors are stuck. A database failure is counted by the adapter and never
 * blanks the scrape.
 */
export function registerUploadScanBacklogCollector(
  metrics: PrometheusMetrics,
  db: UploadTransaction,
  store: Pick<UploadStore, "scanBacklog">,
  now: () => Date = () => new Date()
): void {
  metrics.onCollect("upload_scan_backlog", async () => {
    const { pending, oldestSince } = await store.scanBacklog(db);
    metrics.gauge("upload_scan_pending", pending);
    metrics.gauge(
      "upload_scan_oldest_pending_age_seconds",
      oldestSince
        ? Math.max(0, (now().getTime() - oldestSince.getTime()) / 1000)
        : 0
    );
  });
}
