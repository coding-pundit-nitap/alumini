import { z } from "zod";

import { defineJob } from "./define-job.ts";

/** Ids only: a consumer looks the rows up, so the event never carries a name, message or note. */
const mentorshipEventPayload = z
  .object({
    v: z.literal(1),
    mentorshipId: z.uuid(),
    mentorId: z.uuid(),
    menteeId: z.uuid(),
    /** Who acted; the consumer notifies the other participant. */
    actorId: z.uuid(),
  })
  .strict();
export type MentorshipEventPayload = z.infer<typeof mentorshipEventPayload>;

const retry = {
  attempts: 5,
  baseDelayMs: 5_000,
  maxDelayMs: 300_000,
  jitter: 0.2,
};

const mentorshipJob = <N extends `mentorship.${string}`>(name: N) =>
  defineJob({
    name,
    version: 1,
    queue: "default",
    schema: mentorshipEventPayload,
    retry,
    timeoutMs: 10_000,
    idempotency:
      "Delivers notifications keyed by a dedupeKey of (event id, recipient, type): a rerun finds the existing rows and enqueues no second email, so running twice has the same effect as once.",
  });

/** Facts a mentorship changed, written to the outbox with the change. */
export const mentorshipJobs = {
  "mentorship.requested": mentorshipJob("mentorship.requested"),
  "mentorship.accepted": mentorshipJob("mentorship.accepted"),
  "mentorship.declined": mentorshipJob("mentorship.declined"),
  "mentorship.cancelled": mentorshipJob("mentorship.cancelled"),
  "mentorship.started": mentorshipJob("mentorship.started"),
  "mentorship.completed": mentorshipJob("mentorship.completed"),
} as const;
