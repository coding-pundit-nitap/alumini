import { PERMISSIONS } from "@nitap/database/permissions";

import { NotFoundError, RateLimitedError, ValidationError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { decideDirectAccess } from "../domain/messaging";
import type { Authorize } from "./authz";
import type { MessagingObserver, MessagingStore } from "./messaging-store";
import { CREATE_RATE, type RateLimiter } from "./rate-limit";
import { refuse } from "./refusal";

/**
 * A pair has one conversation: the unique pair key makes a concurrent loser
 * re-read the winner's row.
 */
export function createCreateDirectConversation(deps: {
  store: MessagingStore;
  authorize: Authorize;
  rateLimiter: RateLimiter;
  observe?: MessagingObserver;
}) {
  return async function createDirectConversation(args: {
    actor: Actor | null;
    recipientId: string;
  }): Promise<{ conversationId: string; created: boolean }> {
    const caller = deps.authorize(args.actor, PERMISSIONS.MESSAGE_SEND);
    const recipientId = args.recipientId.toLowerCase();
    if (recipientId === caller.userId.toLowerCase()) {
      throw new ValidationError({ code: "CANNOT_MESSAGE_SELF" });
    }
    const verdict = await deps.rateLimiter.consume(
      `conversations.create:${caller.userId}`,
      CREATE_RATE
    );
    if (!verdict.allowed) throw new RateLimitedError(verdict.retryAfter ?? 60);

    const result = await deps.store.transaction(async (tx) => {
      if ((await tx.accountState(recipientId)) !== "VERIFIED") {
        throw new NotFoundError();
      }
      const decision = decideDirectAccess(
        await tx.blockBetween(caller.userId, recipientId),
        caller.userId
      );
      if (!decision.ok) refuse(decision);
      return tx.getOrCreateDirect(caller.userId, recipientId);
    });
    if (result.created) deps.observe?.("conversation_created", result.id);
    return { conversationId: result.id, created: result.created };
  };
}
