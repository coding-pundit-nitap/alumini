import { z } from "zod";

import { defineJob, FANOUT_TIMEOUT_MS } from "./define-job.ts";

/** Ids only, per reliability §6.4: a consumer re-reads the row, never trusts a name or note in the event. */
const jobEventPayload = z
  .object({
    v: z.literal(1),
    jobId: z.uuid(),
    postedBy: z.uuid(),
    /** Who acted: the poster (submit), a reviewer (publish/reject), or whoever closed it. */
    actorId: z.uuid(),
  })
  .strict();
export type JobEventPayload = z.infer<typeof jobEventPayload>;

/** `job.published` alone distinguishes a moderated publish from a `job.approve` holder's direct one. */
const jobPublishedPayload = jobEventPayload.extend({
  directPublish: z.boolean(),
});
export type JobPublishedPayload = z.infer<typeof jobPublishedPayload>;

const retry = {
  attempts: 5,
  baseDelayMs: 5_000,
  maxDelayMs: 300_000,
  jitter: 0.2,
};
const idempotency =
  "Delivers notifications keyed by a dedupeKey of (event id, recipient, type): a rerun finds the existing rows and enqueues no second email, so running twice has the same effect as once.";

/** Facts a job posting changed, written to the outbox with the change. Phase 11 notifies on them. */
export const jobEvents = {
  "job.submitted": defineJob({
    name: "job.submitted",
    version: 1,
    queue: "default",
    schema: jobEventPayload,
    retry,
    timeoutMs: FANOUT_TIMEOUT_MS,
    idempotency,
  }),
  "job.published": defineJob({
    name: "job.published",
    version: 1,
    queue: "default",
    schema: jobPublishedPayload,
    retry,
    timeoutMs: 10_000,
    idempotency,
  }),
  "job.rejected": defineJob({
    name: "job.rejected",
    version: 1,
    queue: "default",
    schema: jobEventPayload,
    retry,
    timeoutMs: 10_000,
    idempotency,
  }),
  "job.closed": defineJob({
    name: "job.closed",
    version: 1,
    queue: "default",
    schema: jobEventPayload,
    retry,
    timeoutMs: 10_000,
    idempotency,
  }),
} as const;
