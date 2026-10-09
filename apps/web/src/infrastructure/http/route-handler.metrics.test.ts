import { afterEach, describe, expect, it } from "vitest";

import {
  createPrometheusMetrics,
  noopMetrics,
  setMetrics,
} from "@nitap/observability";

import { routeHandler } from "./route-handler";

afterEach(() => {
  setMetrics(noopMetrics);
  delete (globalThis as unknown as Record<symbol, unknown>)[
    Symbol.for("nitap.metrics.prometheus")
  ];
});

describe("routeHandler HTTP metrics", () => {
  it("counts each request and observes its duration by route and status class", async () => {
    const metrics = createPrometheusMetrics({ service: "web", version: "t" });
    setMetrics(metrics);
    const handler = routeHandler(async () => Response.json({ ok: true }));
    const url =
      "http://localhost/api/v1/posts/3f2b8c1e-9a4d-4e2b-8c1a-0d9e8f7a6b5c";
    await handler(new Request(url));
    await handler(new Request(url));

    const { body } = await metrics.render();
    expect(body).toMatch(
      /http_requests_total\{[^}]*route="\/api\/v1\/posts\/:id"[^}]*status_class="2xx"[^}]*\} 2/
    );
    expect(body).toMatch(
      /http_request_duration_seconds_count\{[^}]*route="\/api\/v1\/posts\/:id"[^}]*\} 2/
    );
  });

  it("labels a thrown error with its mapped status class", async () => {
    const metrics = createPrometheusMetrics({ service: "web", version: "t" });
    setMetrics(metrics);
    const handler = routeHandler(async () => {
      throw new Error("boom");
    });
    await handler(new Request("http://localhost/api/v1/notifications"));
    const { body } = await metrics.render();
    expect(body).toMatch(
      /http_requests_total\{[^}]*status_class="5xx"[^}]*\} 1/
    );
  });
});
