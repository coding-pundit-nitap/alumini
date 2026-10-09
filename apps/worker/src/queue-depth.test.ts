import { afterEach, describe, expect, it } from "vitest";

import { createPrometheusMetrics } from "@nitap/observability";

import { registerQueueDepthCollector } from "./queue-depth.ts";

afterEach(() => {
  delete (globalThis as unknown as Record<symbol, unknown>)[
    Symbol.for("nitap.metrics.prometheus")
  ];
});

const zero = { waiting: 0, active: 0, delayed: 0, failed: 0, completed: 0 };

describe("queue depth collector", () => {
  it("sets queue_jobs for every queue and state at scrape time", async () => {
    const metrics = createPrometheusMetrics({
      service: "worker",
      version: "t",
    });
    registerQueueDepthCollector(metrics, {
      jobCounts: async (queue) =>
        queue === "email" ? { ...zero, waiting: 3 } : zero,
    });

    const { body } = await metrics.render();

    expect(body).toMatch(
      /queue_jobs\{queue="email",state="waiting",service="worker"\} 3/
    );
    expect(body).toMatch(
      /queue_jobs\{queue="default",state="failed",service="worker"\} 0/
    );
  });

  it("a failing queue Redis is counted and the scrape still renders", async () => {
    const metrics = createPrometheusMetrics({
      service: "worker",
      version: "t",
    });
    registerQueueDepthCollector(metrics, {
      jobCounts: async () => {
        throw new Error("ECONNREFUSED");
      },
    });

    const { body } = await metrics.render();

    expect(body).toMatch(
      /metrics_collect_errors_total\{collector="queue_depth",service="worker"\} 1/
    );
    expect(body).toMatch(/app_build_info/);
  });
});
