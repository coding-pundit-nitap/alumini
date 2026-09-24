import { describe, it, expect, afterEach, vi } from "vitest";
import {
  getMetrics,
  noopMetrics,
  setMetrics,
  type Metrics,
} from "./metrics.ts";

describe("Metrics port (decision D10)", () => {
  afterEach(() => setMetrics(noopMetrics));

  it("defaults to a no-op adapter so callers can always emit", () => {
    const metrics = getMetrics();
    expect(() => {
      metrics.increment("http_requests_total", { status: 200 });
      metrics.observe("http_request_duration_seconds", 0.12, { route: "/x" });
      metrics.gauge("outbox_backlog", 3);
    }).not.toThrow();
  });

  it("delegates to whichever adapter Phase 13 installs", () => {
    const calls: unknown[][] = [];
    const recording: Metrics = {
      increment: (...args) => calls.push(["increment", ...args]),
      observe: (...args) => calls.push(["observe", ...args]),
      gauge: (...args) => calls.push(["gauge", ...args]),
    };
    setMetrics(recording);
    getMetrics().increment("x_total", { a: "b" });
    expect(calls).toEqual([["increment", "x_total", { a: "b" }]]);
  });

  it("keeps the installed adapter across a module re-import (one slot per process, OD-7)", async () => {
    const recording: Metrics = {
      increment: vi.fn(),
      observe: vi.fn(),
      gauge: vi.fn(),
    };
    setMetrics(recording);
    vi.resetModules();
    const fresh = await import("./metrics.ts");
    expect(fresh.getMetrics()).toBe(recording);
    fresh.setMetrics(fresh.noopMetrics);
  });
});
