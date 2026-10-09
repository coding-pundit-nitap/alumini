import { PERMISSIONS } from "@nitap/database/permissions";

import { ConflictError, RateLimitedError, ValidationError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { groupInput } from "../domain/messaging";
import type { Authorize } from "./authz";
import type { MessagingObserver, MessagingStore } from "./messaging-store";
import { CREATE_RATE, type RateLimiter } from "./rate-limit";
import { parse } from "./validation";

/** Creator-admin group of 3..20 verified members, none blocked with another. */
export function createCreateGroupConversation(deps: {
  store: MessagingStore;
  authorize: Authorize;
  rateLimiter: RateLimiter;
  observe?: MessagingObserver;
}) {
  return async function createGroupConversation(args: {
    actor: Actor | null;
    input: unknown;
  }): Promise<{ conversationId: string }> {
    const caller = deps.authorize(args.actor, PERMISSIONS.MESSAGE_SEND);
    const input = parse(groupInput, args.input);
    const creatorId = caller.userId.toLowerCase();
    const memberIds = input.memberIds.map((id) => id.toLowerCase());
    if (memberIds.includes(creatorId)) {
      throw new ValidationError({
        details: [
          {
            field: "memberIds",
            code: "INVALID",
            message: "Do not include yourself.",
          },
        ],
      });
    }
    const verdict = await deps.rateLimiter.consume(
      `conversations.create:${caller.userId}`,
      CREATE_RATE
    );
    if (!verdict.allowed) throw new RateLimitedError(verdict.retryAfter ?? 60);

    const { id } = await deps.store.transaction(async (tx) => {
      const states = await Promise.all(
        memberIds.map((id) => tx.accountState(id))
      );
      if (states.some((state) => state !== "VERIFIED")) {
        throw new ConflictError("PARTICIPANT_UNAVAILABLE");
      }
      if (await tx.anyBlockAmong([creatorId, ...memberIds])) {
        throw new ConflictError("PARTICIPANT_UNAVAILABLE");
      }
      return tx.createGroup({
        creatorId,
        title: input.title ?? null,
        memberIds,
      });
    });
    deps.observe?.("conversation_created", id);
    return { conversationId: id };
  };
}
