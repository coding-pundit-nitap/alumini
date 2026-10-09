import { afterEach, describe, expect, it } from "vitest";

import {
  createPrometheusMetrics,
  noopMetrics,
  setMetrics,
} from "@nitap/observability";

import { signInOutcome, withSignInMetrics } from "./sign-in-metrics";

afterEach(() => {
  setMetrics(noopMetrics);
  delete (globalThis as unknown as Record<symbol, unknown>)[
    Symbol.for("nitap.metrics.prometheus")
  ];
});

describe("sign-in metrics", () => {
  it.each([
    [200, "success"],
    [401, "invalid_credentials"],
    [403, "forbidden"],
    [429, "rate_limited"],
    [400, "invalid_request"],
    [500, "error"],
  ] as const)("maps %i to %s", (status, outcome) => {
    expect(signInOutcome(status)).toBe(outcome);
  });

  it("counts email sign-ins by outcome and ignores other auth paths", async () => {
    const metrics = createPrometheusMetrics({ service: "web", version: "t" });
    setMetrics(metrics);
    const statuses = [401, 401, 429, 200];
    const handler = withSignInMetrics(
      async () => new Response(null, { status: statuses.shift() ?? 200 })
    );
    const signIn = "http://localhost/api/auth/sign-in/email";
    for (let i = 0; i < 4; i++)
      await handler(new Request(signIn, { method: "POST" }));
    const other = await handler(
      new Request("http://localhost/api/auth/sign-up/email", { method: "POST" })
    );

    expect(other.status).toBe(200);
    const { body } = await metrics.render();
    expect(body).toMatch(
      /auth_sign_in_total\{[^}]*outcome="invalid_credentials"[^}]*\} 2/
    );
    expect(body).toMatch(
      /auth_sign_in_total\{[^}]*outcome="rate_limited"[^}]*\} 1/
    );
    expect(body).toMatch(/auth_sign_in_total\{[^}]*outcome="success"[^}]*\} 1/);
  });
});
