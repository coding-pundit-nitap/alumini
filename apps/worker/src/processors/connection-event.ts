import type { ConnectionEventPayload } from "@nitap/jobs";
import type { JobProcessor } from "@nitap/queue";

/**
 * Acknowledges a `connection.requested` / `connection.accepted` event. Phase 10 (notifications) replaces the
 * body with the in-app and email fan-out; until then the event is only recorded, so the outbox drains and the
 * history stays replayable. Ids only: nothing personal is logged.
 */
export function createConnectionEventProcessor(
  event: "requested" | "accepted"
): JobProcessor<ConnectionEventPayload> {
  return async (payload, { logger }) => {
    logger.info(`connection.${event}.handled`, {
      metadata: {
        connectionId: payload.connectionId,
        actorId: payload.actorId,
        recipientId: payload.recipientId,
      },
    });
  };
}
