import { z } from "zod";

import { defineJob } from "./define-job.ts";

/** Ids only; no actorId — the worker sweep has no actor (spec J-7, J-13). */
const jobExpiredPayload = z
  .object({ v: z.literal(1), jobId: z.uuid(), postedBy: z.uuid() })
  .strict();
export type JobExpiredPayload = z.infer<typeof jobExpiredPayload>;

export const jobExpired = defineJob({
  name: "job.expired",
  version: 1,
  queue: "default",
  schema: jobExpiredPayload,
  retry: { attempts: 5, baseDelayMs: 5_000, maxDelayMs: 300_000, jitter: 0.2 },
  timeoutMs: 10_000,
  idempotency:
    "Delivers notifications keyed by a dedupeKey of (event id, recipient, type): a rerun finds the existing rows and enqueues no second email, so running twice has the same effect as once.",
});

/** Flips overdue PUBLISHED jobs to EXPIRED (spec J-7, J-9). Scheduled only — no use case ever writes this. */
export const jobExpire = defineJob({
  name: "job.expire",
  version: 1,
  queue: "scheduled",
  schema: z.object({ v: z.literal(1) }).strict(),
  retry: { attempts: 3, baseDelayMs: 60_000, maxDelayMs: 600_000, jitter: 0.2 },
  timeoutMs: 120_000,
  idempotency:
    "Each row's flip is a guarded UPDATE (WHERE status = 'PUBLISHED'); a row already EXPIRED, CLOSED or edited back to review is skipped, so running twice has the same effect as once.",
});
