import { afterEach, describe, expect, it } from "vitest";

import { createPrometheusMetrics } from "@nitap/observability";
import type { UploadTransaction } from "@nitap/database/uploads";

import { registerUploadScanBacklogCollector } from "./upload-scan-backlog.ts";

afterEach(() => {
  delete (globalThis as unknown as Record<symbol, unknown>)[
    Symbol.for("nitap.metrics.prometheus")
  ];
});

const db = {} as UploadTransaction;
const metricsFor = () =>
  createPrometheusMetrics({ service: "worker", version: "t" });

describe("upload scan backlog collector", () => {
  it("sets the pending count and the oldest row's age at scrape time", async () => {
    const metrics = metricsFor();
    registerUploadScanBacklogCollector(
      metrics,
      db,
      {
        scanBacklog: async () => ({
          pending: 3,
          oldestSince: new Date("2026-10-09T10:00:00Z"),
        }),
      },
      () => new Date("2026-10-09T10:45:00Z")
    );

    const { body } = await metrics.render();

    expect(body).toMatch(/upload_scan_pending\{service="worker"\} 3/);
    expect(body).toMatch(
      /upload_scan_oldest_pending_age_seconds\{service="worker"\} 2700/
    );
  });

  it("an empty backlog has age 0", async () => {
    const metrics = metricsFor();
    registerUploadScanBacklogCollector(metrics, db, {
      scanBacklog: async () => ({ pending: 0, oldestSince: null }),
    });

    const { body } = await metrics.render();

    expect(body).toMatch(
      /upload_scan_oldest_pending_age_seconds\{service="worker"\} 0/
    );
  });

  it("a failing database is counted and the scrape still renders", async () => {
    const metrics = metricsFor();
    registerUploadScanBacklogCollector(metrics, db, {
      scanBacklog: async () => {
        throw new Error("ECONNREFUSED");
      },
    });

    const { body } = await metrics.render();

    expect(body).toMatch(
      /metrics_collect_errors_total\{collector="upload_scan_backlog",service="worker"\} 1/
    );
  });
});
