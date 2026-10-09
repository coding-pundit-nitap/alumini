export type RateRule = { windowSeconds: number; max: number };

/**
 * Counts attempts per key over a window. The Redis adapter falls back to a
 * stricter in-memory limit.
 */
export interface RateLimiter {
  consume(
    key: string,
    rule: RateRule
  ): Promise<{ allowed: boolean; retryAfterSeconds: number | null }>;
}
