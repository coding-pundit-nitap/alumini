import type { ConnectionEventPayload } from "@nitap/jobs";
import type { JobProcessor } from "@nitap/queue";

import type { DeliverNotification } from "../notifications/deliver.ts";

export type ConnectionEventDeps = {
  deliver: DeliverNotification;
  /** Re-reads the current email; null skips email (account may be deactivated). */
  findEmail: (userId: string) => Promise<string | null>;
  /**
   * Symmetric, checked at delivery time: a block since the event fired
   * suppresses the notification.
   */
  blocked: (a: string, b: string) => Promise<boolean>;
};

/**
 * Notifies the recipient of `connection.requested` / `connection.accepted`. Ids
 * only in logs.
 */
export function createConnectionEventProcessor(
  event: "requested" | "accepted",
  deps: ConnectionEventDeps
): JobProcessor<ConnectionEventPayload> {
  return async (payload, { logger, jobId: eventId }) => {
    logger.info(`connection.${event}.handled`, {
      metadata: {
        connectionId: payload.connectionId,
        actorId: payload.actorId,
        recipientId: payload.recipientId,
      },
    });
    if (await deps.blocked(payload.actorId, payload.recipientId)) return;
    await deps.deliver({
      eventId,
      type: `connection.${event}`,
      category: "ENGAGEMENT",
      recipientId: payload.recipientId,
      payload: { connectionId: payload.connectionId },
      emailTo: (await deps.findEmail(payload.recipientId)) ?? undefined,
    });
  };
}
