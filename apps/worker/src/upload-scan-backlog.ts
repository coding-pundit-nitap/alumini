import type { PrometheusMetrics } from "@nitap/observability";
import type { UploadStore, UploadTransaction } from "@nitap/database/uploads";

/** Sampled at scrape time so the age keeps rising while the scanner is stuck. */
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
