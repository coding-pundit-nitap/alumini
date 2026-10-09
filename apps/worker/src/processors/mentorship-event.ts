import type { MentorshipEventPayload } from "@nitap/jobs";
import type { JobProcessor } from "@nitap/queue";

import type { DeliverNotification } from "../notifications/deliver.ts";

export type MentorshipEventDeps = {
  deliver: DeliverNotification;
  /** Re-reads the current email; null skips email (account may be deactivated). */
  findEmail: (userId: string) => Promise<string | null>;
  /**
   * Symmetric, checked at delivery time: a block since the event fired
   * suppresses the notification.
   */
  blocked: (a: string, b: string) => Promise<boolean>;
};

function recipientsFor(
  action: string,
  { mentorId, menteeId, actorId }: MentorshipEventPayload
): string[] {
  switch (action) {
    case "requested":
      return [mentorId];
    case "accepted":
    case "declined":
    case "started":
      return [menteeId];
    case "completed":
      return [mentorId, menteeId];
    case "cancelled":
      return [mentorId, menteeId].filter((id) => id !== actorId);
    default:
      return [];
  }
}

/** Handles mentorship.*; only requested/accepted also email. Ids only in logs. */
export function createMentorshipEventProcessor(
  action: string,
  deps: MentorshipEventDeps
): JobProcessor<MentorshipEventPayload> {
  return async (payload, { logger, jobId: eventId }) => {
    logger.info(`mentorship.${action}.handled`, {
      metadata: {
        mentorshipId: payload.mentorshipId,
        mentorId: payload.mentorId,
        menteeId: payload.menteeId,
        actorId: payload.actorId,
      },
    });
    const emails = action === "requested" || action === "accepted";
    for (const recipientId of recipientsFor(action, payload)) {
      if (await deps.blocked(payload.actorId, recipientId)) continue;
      await deps.deliver({
        eventId,
        type: `mentorship.${action}`,
        category: "ENGAGEMENT",
        recipientId,
        payload: { mentorshipId: payload.mentorshipId },
        emailTo: emails
          ? ((await deps.findEmail(recipientId)) ?? undefined)
          : undefined,
      });
    }
  };
}
