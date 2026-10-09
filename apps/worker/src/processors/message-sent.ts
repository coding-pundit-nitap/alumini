import { MESSAGE_DEBOUNCE_MS, messageDedupeKeyFor } from "@nitap/jobs";
import type { MessageSentPayload } from "@nitap/jobs";
import type { JobProcessor } from "@nitap/queue";

import type { HintPublisher } from "../hints.ts";
import type { DeliverNotification } from "../notifications/deliver.ts";
import type { MessageDebounce } from "../notifications/message-debounce.ts";

/**
 * Publishes a real-time hint to every participant, then one in-app row and one
 * email per recipient per debounce window. Hint failures are logged, never
 * fatal.
 */
export function createMessageSentProcessor(deps: {
  participants(conversationId: string): Promise<string[]>;
  publisher: HintPublisher | null;
  deliver: DeliverNotification;
  findEmail: (userId: string) => Promise<string | null>;
  /** Symmetric, re-checked at delivery time. */
  blocked: (a: string, b: string) => Promise<boolean>;
  /** Null when Redis is not configured: in-app only, no email. */
  debounce: MessageDebounce | null;
}): JobProcessor<MessageSentPayload> {
  return async (payload, { logger, jobId }) => {
    const { publisher } = deps;
    const userIds = await deps.participants(payload.conversationId);
    const hint = {
      conversationId: payload.conversationId,
      messageId: payload.messageId,
    };
    if (publisher) {
      // A cache Redis outage degrades only real-time push; the notification fan-out below still runs.
      await Promise.all(
        userIds.map((userId) =>
          publisher.publish(userId, hint).catch((error: Error) =>
            logger.warn("message.sent.hint_failed", {
              metadata: { message: error.message },
            })
          )
        )
      );
      logger.info("message.sent.published", {
        metadata: { ...hint, recipients: userIds.length },
      });
    } else {
      logger.warn("message.sent.realtime_disabled", {
        metadata: { conversationId: payload.conversationId },
      });
    }

    for (const recipientId of userIds) {
      if (recipientId === payload.senderId) continue;
      if (await deps.blocked(payload.senderId, recipientId)) continue;
      // Redis down or not configured: in-app only, windowed by clock bucket so it still does not flood.
      let claim = {
        owner: false,
        window: `t${Math.floor(Date.now() / MESSAGE_DEBOUNCE_MS)}`,
      };
      try {
        claim =
          (await deps.debounce?.claim(
            recipientId,
            payload.conversationId,
            jobId
          )) ?? claim;
      } catch (error) {
        // Degrade to in-app only rather than fail (and retry) the whole fan-out.
        logger.warn("message.sent.debounce_unavailable", {
          metadata: { message: (error as Error).message },
        });
      }
      await deps.deliver({
        eventId: jobId,
        type: "message.sent",
        category: "ENGAGEMENT",
        recipientId,
        payload: hint,
        dedupeKey: messageDedupeKeyFor({
          recipientId,
          conversationId: payload.conversationId,
          windowBucket: claim.window,
        }),
        emailTo: claim.owner
          ? ((await deps.findEmail(recipientId)) ?? undefined)
          : undefined,
      });
    }
  };
}
