import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const visible = vi.fn();
vi.mock("@/infrastructure/health", () => ({
  healthDetailsVisible: () => visible(),
}));
vi.mock("@/infrastructure/database/client", () => ({
  pool: { totalCount: 2, idleCount: 1, waitingCount: 0 },
}));

import { createPrometheusMetrics } from "@nitap/observability";

import { GET } from "./route";

const SLOT = Symbol.for("nitap.metrics.prometheus");
beforeEach(() => visible.mockReset());
afterEach(() => {
  delete (globalThis as unknown as Record<symbol, unknown>)[SLOT];
});

describe("GET /metrics (spec 13A A-6)", () => {
  it("answers 404 when the caller may not see monitoring detail", async () => {
    createPrometheusMetrics({ service: "web", version: "t" });
    visible.mockReturnValue(false);
    const response = await GET(new Request("http://localhost/metrics"));
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
  });

  it("answers 404 when no adapter is installed", async () => {
    visible.mockReturnValue(true);
    expect((await GET(new Request("http://localhost/metrics"))).status).toBe(
      404
    );
  });

  it("renders the exposition text with pool gauges when allowed", async () => {
    createPrometheusMetrics({ service: "web", version: "t" });
    visible.mockReturnValue(true);
    const response = await GET(new Request("http://localhost/metrics"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/plain/);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toMatch(
      /db_pool_connections\{state="total",service="web"\} 2/
    );
  });
});
