import { afterEach, describe, expect, it } from "vitest";

import {
  createPrometheusMetrics,
  getPrometheusMetrics,
  recordPoolStats,
} from "./prometheus.ts";

const SLOT = Symbol.for("nitap.metrics.prometheus");
afterEach(() => {
  delete (globalThis as unknown as Record<symbol, unknown>)[SLOT];
});

const make = () =>
  createPrometheusMetrics({ service: "web", version: "1.2.3" });
const scrape = async (m = make()) => (await m.render()).body;

describe("Prometheus adapter (spec 13A A-1…A-5)", () => {
  it("renders counters, histograms and gauges created lazily from the first call's labels", async () => {
    const m = make();
    m.increment("widgets_total", { kind: "a" });
    m.increment("widgets_total", { kind: "a" }, 2);
    m.observe("work_duration_seconds", 0.3, { job: "x" });
    m.gauge("backlog", 7, { queue: "email" });
    const body = await scrape(m);
    expect(body).toMatch(/widgets_total\{kind="a",service="web"\} 3/);
    expect(body).toMatch(
      /work_duration_seconds_bucket\{le="0.5",service="web",job="x"\} 1/
    );
    expect(body).toMatch(
      /work_duration_seconds_bucket\{le="120",service="web",job="x"\} 1/
    );
    expect(body).toMatch(/backlog\{queue="email",service="web"\} 7/);
  });

  it("stringifies boolean labels", async () => {
    const m = make();
    m.increment("flags_total", { on: true });
    expect(await scrape(m)).toMatch(/flags_total\{on="true",service="web"\} 1/);
  });

  it("drops and counts a call with an unknown label key or a type clash, never throws (A-2)", async () => {
    const m = make();
    m.increment("mixed_total", { a: "1" });
    expect(() => m.increment("mixed_total", { b: "2" })).not.toThrow();
    expect(() => m.gauge("mixed_total", 1)).not.toThrow();
    const body = await scrape(m);
    expect(body).toMatch(/mixed_total\{a="1",service="web"\} 1/);
    expect(body).toMatch(
      /metrics_adapter_errors_total\{name="mixed_total",service="web"\} 2/
    );
  });

  it("exports app_build_info and default process metrics (A-4)", async () => {
    const body = await scrape();
    expect(body).toMatch(/app_build_info\{version="1.2.3",service="web"\} 1/);
    expect(body).toMatch(/process_cpu_user_seconds_total/);
  });

  it("returns the same instance on a second create, so a reload never double-registers (A-5)", () => {
    const first = make();
    expect(createPrometheusMetrics({ service: "web", version: "other" })).toBe(
      first
    );
    expect(getPrometheusMetrics()).toBe(first);
  });

  it("runs collect hooks before rendering; a failing or slow hook is counted, not fatal", async () => {
    const m = make();
    m.onCollect("good", () => m.gauge("sampled", 5));
    m.onCollect("bad", () => {
      throw new Error("down");
    });
    m.onCollect("slow", () => new Promise(() => {}));
    const started = Date.now();
    const body = await scrape(m);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(body).toMatch(/sampled\{service="web"\} 5/);
    expect(body).toMatch(
      /metrics_collect_errors_total\{collector="bad",service="web"\} 1/
    );
    expect(body).toMatch(
      /metrics_collect_errors_total\{collector="slow",service="web"\} 1/
    );
  });

  it("recordPoolStats sets db_pool_connections per state (A-10)", async () => {
    const m = make();
    recordPoolStats(m, { totalCount: 4, idleCount: 3, waitingCount: 1 });
    const body = await scrape(m);
    expect(body).toMatch(
      /db_pool_connections\{state="total",service="web"\} 4/
    );
    expect(body).toMatch(/db_pool_connections\{state="idle",service="web"\} 3/);
    expect(body).toMatch(
      /db_pool_connections\{state="waiting",service="web"\} 1/
    );
  });
});
