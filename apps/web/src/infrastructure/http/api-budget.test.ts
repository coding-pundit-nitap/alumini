import { describe, expect, it, vi } from "vitest";

import { RateLimitedError } from "@/lib/errors";

import { API_BUDGET, createApiBudget } from "./api-budget";

// One API-wide allowance per signed-in user, charged once per Route Handler request.

function harness(allowed = true) {
  const consume = vi.fn(async () => ({
    allowed,
    retryAfter: allowed ? null : 42,
  }));
  return { consume, budget: createApiBudget({ consume }) };
}

describe("API budget", () => {
  it("charges the signed-in user once per API request, under its own key", async () => {
    const { consume, budget } = harness();
    await budget.scope(async () => {
      await budget.charge("user-1");
      await budget.charge("user-1"); // a route that resolves the actor twice
    });
    expect(consume).toHaveBeenCalledTimes(1);
    expect(consume).toHaveBeenCalledWith("api:user:user-1", {
      window: API_BUDGET.windowSeconds,
      max: API_BUDGET.max,
    });
  });

  it("charges nothing outside an API request (pages and Server Actions)", async () => {
    const { consume, budget } = harness();
    await budget.charge("user-1");
    expect(consume).not.toHaveBeenCalled();
  });

  it("refuses with 429 and the limiter's Retry-After once the allowance is spent", async () => {
    const { budget } = harness(false);
    const error = await budget
      .scope(() => budget.charge("user-1"))
      .then(
        () => null,
        (e: unknown) => e
      );
    expect(error).toBeInstanceOf(RateLimitedError);
    expect((error as RateLimitedError).retryAfterSeconds).toBe(42);
  });

  it("gives each request its own scope", async () => {
    const { consume, budget } = harness();
    await Promise.all([
      budget.scope(() => budget.charge("a")),
      budget.scope(() => budget.charge("b")),
    ]);
    expect(consume).toHaveBeenCalledTimes(2);
  });

  it("allows bursts well above any page's fan-out", () => {
    expect(API_BUDGET.max / API_BUDGET.windowSeconds).toBeGreaterThanOrEqual(5);
  });
});
