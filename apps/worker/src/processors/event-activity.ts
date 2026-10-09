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
  /** Non-CANCELLED registrants right now (REGISTERED/ATTENDED/NO_SHOW: current state, not at emit time). */
  findActiveRegistrants: (eventId: string) => Promise<string[]>;
  /** Symmetric, checked at delivery time. */
  blocked: (a: string, b: string) => Promise<boolean>;
};

export function createEventActivityProcessor(
  action: string,
  deps: EventActivityDeps
): JobProcessor<EventLifecyclePayload | EventRegistrationPayload> {
  return async (payload, { logger, signal, jobId: eventId }) => {
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
      // Sequential, ~2,000 recipients per attempt. On timeout the retry resumes cheaply because deliver
      // dedupes per recipient.
      for (const recipientId of await deps.findActiveRegistrants(
        payload.eventId
      )) {
        signal.throwIfAborted();
        if (recipientId === payload.actorId) continue;
        if (await deps.blocked(payload.actorId, recipientId)) continue;
        await send(recipientId, "event.cancelled");
      }
    } else if (action === "registered" && "userId" in payload) {
      // Self-registration still confirms (no actor skip).
      await send(payload.userId, "event.registered");
    } else if (
      action === "registration-cancelled" &&
      "userId" in payload &&
      payload.actorId !== payload.userId
    ) {
      // In-app + email. No producer sets another actor yet; self-cancellation needs no notice.
      if (await deps.blocked(payload.actorId, payload.userId)) return;
      await send(payload.userId, "event.registration-cancelled");
    }
  };
}
