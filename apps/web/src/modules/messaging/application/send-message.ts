import { PERMISSIONS } from "@nitap/database/permissions";

import { NotFoundError, RateLimitedError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { decideDirectAccess, messageInput } from "../domain/messaging";
import { requireParticipant } from "./access";
import type { Authorize } from "./authz";
import type {
  MessageRow,
  MessagingObserver,
  MessagingStore,
} from "./messaging-store";
import { SEND_RATE, type RateLimiter } from "./rate-limit";
import { refuse } from "./refusal";
import { parse } from "./validation";

/**
 * FR-MSG-001/002/005. The message, every recipient's unread counter and the `message.sent` event commit
 * together; nothing about delivery runs in the request. The conversation row lock serialises sends, so `seq`
 * is commit-ordered within a conversation and a retried `clientMessageId` finds its first result.
 */
export function createSendMessage(deps: {
  store: MessagingStore;
  authorize: Authorize;
  rateLimiter: RateLimiter;
  observe?: MessagingObserver;
}) {
  return async function sendMessage(args: {
    actor: Actor | null;
    conversationId: string;
    input: unknown;
  }): Promise<{ message: MessageRow; created: boolean }> {
    const caller = deps.authorize(args.actor, PERMISSIONS.MESSAGE_SEND);
    const input = parse(messageInput, args.input);
    const verdict = await deps.rateLimiter.consume(
      `messages.send:${caller.userId}`,
      SEND_RATE
    );
    if (!verdict.allowed) throw new RateLimitedError(verdict.retryAfter ?? 60);

    const senderId = caller.userId.toLowerCase();
    const result = await deps.store.transaction(async (tx) => {
      const { conversation, participantIds } = await requireParticipant(
        tx,
        args.conversationId,
        senderId
      );
      if (!conversation.isGroup) {
        const other = participantIds.find((id) => id !== senderId);
        if (!other || (await tx.accountState(other)) !== "VERIFIED") {
          throw new NotFoundError();
        }
        const decision = decideDirectAccess(
          await tx.blockBetween(senderId, other),
          senderId
        );
        if (!decision.ok) refuse(decision);
      }

      const existing = await tx.findMessageByClientId(
        conversation.id,
        senderId,
        input.clientMessageId
      );
      if (existing) return { message: existing, created: false };

      const message = await tx.insertMessage({
        conversationId: conversation.id,
        senderId,
        body: input.body,
        clientMessageId: input.clientMessageId,
      });
      await tx.recordSend(message);
      await tx.enqueue({
        type: "message.sent",
        payload: {
          v: 1,
          messageId: message.id,
          conversationId: conversation.id,
          senderId,
        },
      });
      return { message, created: true };
    });
    if (result.created) deps.observe?.("sent", result.message.id);
    return result;
  };
}
