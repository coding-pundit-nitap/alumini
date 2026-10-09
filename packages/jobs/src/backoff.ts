import type { RetryPolicy } from "./define-job.ts";

/**
 * Exponential from `baseDelayMs`, capped at `maxDelayMs`, with jitter so
 * failures don't retry in lockstep.
 */
export function computeBackoffMs(
  policy: RetryPolicy,
  attemptsMade: number,
  random: () => number = Math.random
): number {
  const exponent = Math.max(0, attemptsMade - 1);
  const raw = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** exponent);
  const jittered = raw * (1 + policy.jitter * (2 * random() - 1));
  return Math.min(policy.maxDelayMs, Math.max(1, Math.round(jittered)));
}
