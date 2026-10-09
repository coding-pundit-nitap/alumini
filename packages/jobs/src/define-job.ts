import type { ZodType } from "zod";

import type { QueueName } from "./queues.ts";

export type RetryPolicy = {
  /** Total attempts including the first. */
  attempts: number;
  /** Delay before the second attempt; doubles each attempt. */
  baseDelayMs: number;
  maxDelayMs: number;
  /** ±fraction of each delay, e.g. 0.2 for ±20%. */
  jitter: number;
};

export type JobDefinition<TName extends string = string, TPayload = unknown> = {
  readonly name: TName;
  /** Payload version this definition validates. A new payload shape is a new version, never an edit. */
  readonly version: number;
  readonly queue: QueueName;
  readonly schema: ZodType<TPayload>;
  readonly retry: RetryPolicy;
  readonly timeoutMs: number;
  /** What makes a second run harmless. A reviewer must be able to read it. */
  readonly idempotency: string;
};

/**
 * ~10-12 round trips per recipient at ~5 ms each, so 120 s covers ~2,000 recipients. Larger sets time
 * out and the retry skips already-delivered recipients.
 */
export const FANOUT_TIMEOUT_MS = 120_000;

export type PayloadOf<D> = D extends JobDefinition<string, infer P> ? P : never;

/** Validates the definition at load time so a bad job fails on startup, not on the first message. */
export function defineJob<TName extends string, TPayload>(
  definition: JobDefinition<TName, TPayload>
): JobDefinition<TName, TPayload> {
  const { name, version, retry, timeoutMs, idempotency } = definition;
  if (!/^[a-z]+(\.[a-z-]+)+$/.test(name)) {
    throw new Error(
      `Job name "${name}" must be lower-case and dot-separated, e.g. email.send`
    );
  }
  if (!Number.isInteger(version) || version < 1) {
    throw new Error(`Job "${name}": version must be an integer >= 1`);
  }
  if (!Number.isInteger(retry.attempts) || retry.attempts < 1) {
    throw new Error(`Job "${name}": attempts must be an integer >= 1`);
  }
  if (retry.baseDelayMs <= 0 || retry.maxDelayMs < retry.baseDelayMs) {
    throw new Error(`Job "${name}": need 0 < baseDelayMs <= maxDelayMs`);
  }
  if (retry.jitter < 0 || retry.jitter >= 1) {
    throw new Error(`Job "${name}": jitter must be in [0, 1)`);
  }
  if (timeoutMs <= 0) {
    throw new Error(`Job "${name}": timeoutMs must be positive`);
  }
  if (idempotency.trim().length < 10) {
    throw new Error(`Job "${name}" must state its idempotency rule`);
  }
  return Object.freeze({ ...definition, retry: Object.freeze({ ...retry }) });
}
