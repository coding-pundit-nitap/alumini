import { z } from "zod";

import { defineJob } from "./define-job.ts";

/** Ids only: a consumer looks the rows up, so the event never carries a name or an address (reliability §6.4). */
const connectionEventPayload = z
  .object({
    v: z.literal(1),
    connectionId: z.uuid(),
    /** The member who acted: the requester for `requested`, the accepter for `accepted`. */
    actorId: z.uuid(),
    /** The member to tell about it. */
    recipientId: z.uuid(),
  })
  .strict();
export type ConnectionEventPayload = z.infer<typeof connectionEventPayload>;

const retry = {
  attempts: 5,
  baseDelayMs: 5_000,
  maxDelayMs: 300_000,
  jitter: 0.2,
};

/**
 * Facts a connection changed, written to the outbox in the same transaction as the change (FR-NET, NFR-REL-002).
 * The notification fan-out that consumes them arrives with Phase 10; until then the worker only acknowledges
 * them, which keeps the outbox draining and the event history replayable.
 */
export const connectionRequested = defineJob({
  name: "connection.requested",
  version: 1,
  queue: "default",
  schema: connectionEventPayload,
  retry,
  timeoutMs: 10_000,
  idempotency:
    "Handling only reads and logs; running twice has the same effect as once.",
});

export const connectionAccepted = defineJob({
  name: "connection.accepted",
  version: 1,
  queue: "default",
  schema: connectionEventPayload,
  retry,
  timeoutMs: 10_000,
  idempotency:
    "Handling only reads and logs; running twice has the same effect as once.",
});
