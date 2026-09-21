import type { MessageSentPayload } from "@nitap/jobs";
import type { JobProcessor } from "@nitap/queue";

import type { HintPublisher } from "../hints.ts";

/**
 * Turns a committed message into a real-time hint for every participant (FR-MSG-005 keeps the message safe
 * without this: delivery never depends on the recipient being online). Ids only. A Redis failure fails the
 * job and the queue retries it; publishing twice only makes a client refetch twice.
 */
export function createMessageSentProcessor(deps: {
  participants(conversationId: string): Promise<string[]>;
  publisher: HintPublisher | null;
}): JobProcessor<MessageSentPayload> {
  return async (payload, { logger }) => {
    const { publisher } = deps;
    if (!publisher) {
      logger.warn("message.sent.realtime_disabled", {
        metadata: { conversationId: payload.conversationId },
      });
      return;
    }
    const userIds = await deps.participants(payload.conversationId);
    const hint = {
      conversationId: payload.conversationId,
      messageId: payload.messageId,
    };
    await Promise.all(userIds.map((userId) => publisher.publish(userId, hint)));
    logger.info("message.sent.published", {
      metadata: { ...hint, recipients: userIds.length },
    });
  };
}
