import { AsyncLocalStorage } from "node:async_hooks";

import { RateLimitedError } from "@/lib/errors";

/**
 * The API-wide allowance per signed-in user (SRS §36 "Global API → Authenticated user", spec 16 SD-7).
 * A fixed window that allows bursts: far above what any page fans out to, low enough that a script
 * cannot hammer the API. The stricter per-feature limits (search, messaging, connections…) still apply.
 */
export const API_BUDGET = { windowSeconds: 60, max: 300 } as const;

type Consume = (
  key: string,
  rule: { window: number; max: number }
) => Promise<{ allowed: boolean; retryAfter: number | null }>;

/**
 * `routeHandler` opens a scope per request; `getActor` charges the caller once it knows who they are. Outside
 * a scope (pages, Server Actions) nothing is charged, and a second `getActor` in one request is free.
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
