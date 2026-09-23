import { z } from "zod";

import { defineJob } from "./define-job.ts";

/** An event's own lifecycle: created, cancelled. Ids only (reliability §6.4). */
const eventLifecyclePayload = z
  .object({
    v: z.literal(1),
    eventId: z.uuid(),
    /** The organizer (created) or whoever cancelled it. */
    actorId: z.uuid(),
  })
  .strict();
export type EventLifecyclePayload = z.infer<typeof eventLifecyclePayload>;

/** A registration changed: the consumer looks the row up for its state, the event never carries it. */
const eventRegistrationPayload = z
  .object({
    v: z.literal(1),
    eventId: z.uuid(),
    registrationId: z.uuid(),
    /** The registrant, who is notified. */
    userId: z.uuid(),
    /** Who acted: the registrant, or the organizer marking attendance. */
    actorId: z.uuid(),
  })
  .strict();
export type EventRegistrationPayload = z.infer<typeof eventRegistrationPayload>;

const retry = {
  attempts: 5,
  baseDelayMs: 5_000,
  maxDelayMs: 300_000,
  jitter: 0.2,
};

const eventJob = <N extends `event.${string}`, S extends z.ZodType>(
  name: N,
  schema: S
) =>
  defineJob({
    name,
    version: 1,
    queue: "default",
    schema,
    retry,
    timeoutMs: 10_000,
    idempotency:
      "Handling only reads and logs; running twice has the same effect as once.",
  });

/** Facts about events and registrations, written to the outbox with the change (FR-EVENT, NFR-REL-002). Delivery is Phase 11. */
export const eventJobs = {
  "event.created": eventJob("event.created", eventLifecyclePayload),
  "event.cancelled": eventJob("event.cancelled", eventLifecyclePayload),
  "event.registered": eventJob("event.registered", eventRegistrationPayload),
  "event.registration-cancelled": eventJob(
    "event.registration-cancelled",
    eventRegistrationPayload
  ),
  "event.attendance-marked": eventJob(
    "event.attendance-marked",
    eventRegistrationPayload
  ),
} as const;
