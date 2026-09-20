import type { RetryPolicy } from "./define-job.ts";

/**
 * Delay before the next attempt, after `attemptsMade` attempts have failed (1-based): exponential from
 * `baseDelayMs`, capped at `maxDelayMs`, with ±`jitter` so a burst of failures does not retry in lockstep.
 * `random` is injectable for tests.
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
