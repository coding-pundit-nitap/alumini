import { z } from "zod";

import { defineJob } from "@nitap/jobs";

/**
 * The job both sides of the crash test agree on (shared by the test and its
 * child worker process).
 */
export const crashJob = defineJob({
  name: "test.crash",
  version: 1,
  queue: "default",
  schema: z.object({ v: z.literal(1), n: z.number() }).strict(),
  retry: { attempts: 3, baseDelayMs: 20, maxDelayMs: 40, jitter: 0 },
  timeoutMs: 60_000,
  idempotency: "test job: a second run only records a second call",
});

/**
 * Short locks so a dead worker's job is recovered in about two seconds, not a
 * minute.
 */
export const FAST_STALL = { lockDurationMs: 1_000, stalledIntervalMs: 500 };
