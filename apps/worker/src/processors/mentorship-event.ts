import type { MentorshipEventPayload } from "@nitap/jobs";
import type { JobProcessor } from "@nitap/queue";

/** Acknowledges a `mentorship.*` event; Phase 11 replaces the body with notification fan-out. Ids only. */
export function createMentorshipEventProcessor(
  event: string
): JobProcessor<MentorshipEventPayload> {
  return async (payload, { logger }) => {
    logger.info(`mentorship.${event}.handled`, {
      metadata: {
        mentorshipId: payload.mentorshipId,
        mentorId: payload.mentorId,
        menteeId: payload.menteeId,
        actorId: payload.actorId,
      },
    });
  };
}
