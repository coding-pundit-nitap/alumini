import type { MessageSentPayload } from "@nitap/jobs";
import type { JobProcessor } from "@nitap/queue";

import type { HintPublisher } from "../hints.ts";
import type { DeliverNotification } from "../notifications/deliver.ts";
import type { MessageDebounce } from "../notifications/message-debounce.ts";

/**
 * Turns a committed message into a real-time hint for every participant (FR-MSG-005 keeps the message safe
 * without this: delivery never depends on the recipient being online), then delivers an in-app notification
 * to every other participant. The in-app row is written per message; only the email is debounced (spec N-7).
 * Ids only. A Redis failure on hints is logged, never fatal: clients refetch on their poll/focus.
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
      // N-9: a cache Redis outage degrades only real-time push; the notification fan-out below still runs.
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
      let openWindow = false;
      try {
        openWindow =
          (await deps.debounce?.tryStart(
            recipientId,
            payload.conversationId,
            jobId
          )) ?? false;
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
        emailTo: openWindow
          ? ((await deps.findEmail(recipientId)) ?? undefined)
          : undefined,
      });
    }
  };
}
