import { AsyncLocalStorage } from "node:async_hooks";

import { RateLimitedError } from "@/lib/errors";

/** A per-user allowance across the API; the per-feature limits still apply. */
export const API_BUDGET = { windowSeconds: 60, max: 300 } as const;

type Consume = (
  key: string,
  rule: { window: number; max: number }
) => Promise<{ allowed: boolean; retryAfter: number | null }>;

/**
 * Charged once per request when `getActor` resolves the caller. Nothing is
 * charged outside a scope.
 */
export function createApiBudget(deps: { consume: Consume }) {
  const scopes = new AsyncLocalStorage<{ charged: boolean }>();
  return {
    scope<T>(fn: () => Promise<T>): Promise<T> {
      return scopes.run({ charged: false }, fn);
    },
    async charge(userId: string): Promise<void> {
      const state = scopes.getStore();
      if (!state || state.charged) return;
      state.charged = true;
      const { allowed, retryAfter } = await deps.consume(`api:user:${userId}`, {
        window: API_BUDGET.windowSeconds,
        max: API_BUDGET.max,
      });
      if (!allowed)
        throw new RateLimitedError(retryAfter ?? API_BUDGET.windowSeconds);
    },
  };
}
