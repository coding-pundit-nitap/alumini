import type {
  EventLifecyclePayload,
  EventRegistrationPayload,
} from "@nitap/jobs";
import type { JobProcessor } from "@nitap/queue";

import type { DeliverNotification } from "../notifications/deliver.ts";

export type EventActivityDeps = {
  deliver: DeliverNotification;
  /** Re-reads the current email; null skips email (account may be deactivated). */
  findEmail: (userId: string) => Promise<string | null>;
  /** Registrants still REGISTERED right now (N-3: current state, not the state at emit time). */
  findActiveRegistrants: (eventId: string) => Promise<string[]>;
  /** Symmetric, checked at delivery time. */
  blocked: (a: string, b: string) => Promise<boolean>;
};

/**
 * Handles event.*. Only cancelled (fan-out to registrants) and registered (confirmation to the registrant)
 * notify; both email. Ids only in logs.
 */
export function createEventActivityProcessor(
  action: string,
  deps: EventActivityDeps
): JobProcessor<EventLifecyclePayload | EventRegistrationPayload> {
  return async (payload, { logger, jobId: eventId }) => {
    const ids: Record<string, unknown> = { ...payload };
    delete ids.v;
    logger.info(`event.${action}.handled`, { metadata: ids });

    const send = async (recipientId: string, type: string) =>
      deps.deliver({
        eventId,
        type,
        category: "ENGAGEMENT",
        recipientId,
        payload: { eventId: payload.eventId },
        emailTo: (await deps.findEmail(recipientId)) ?? undefined,
      });

    if (action === "cancelled") {
      // ponytail: sequential; fine to a few thousand registrants. A midway failure retries safely
      // (deliver dedupes per recipient on the stable jobId); fan out in chunks if events grow past that.
      for (const recipientId of await deps.findActiveRegistrants(
        payload.eventId
      )) {
        if (recipientId === payload.actorId) continue;
        if (await deps.blocked(payload.actorId, recipientId)) continue;
        await send(recipientId, "event.cancelled");
      }
    } else if (action === "registered" && "userId" in payload) {
      // Self-registration still confirms (no actor skip).
      await send(payload.userId, "event.registered");
    }
  };
}
