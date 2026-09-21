// apps/web/src/modules/messaging/application/manage-participants.ts
import { PERMISSIONS } from "@nitap/database/permissions";

import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { decideAddCapacity, decideManage } from "../domain/messaging";
import { requireParticipant } from "./access";
import type { Authorize } from "./authz";
import type { MessagingObserver, MessagingStore } from "./messaging-store";
import { refuse } from "./refusal";

type Deps = {
  store: MessagingStore;
  authorize: Authorize;
  observe?: MessagingObserver;
};
type Args = { actor: Actor | null; conversationId: string; userId: string };

/**
 * Creator-only add (spec M-6). The conversation row lock (taken by `requireParticipant`) makes the count and
 * the insert one atomic step, so the 20-member cap holds under concurrent adds.
 */
export function createAddParticipant(deps: Deps) {
  return async function addParticipant(
    args: Args
  ): Promise<{ added: boolean }> {
    const caller = deps.authorize(args.actor, PERMISSIONS.MESSAGE_SEND);
    const callerId = caller.userId.toLowerCase();
    const target = args.userId.toLowerCase();

    const added = await deps.store.transaction(async (tx) => {
      const { conversation, participantIds } = await requireParticipant(
        tx,
        args.conversationId,
        callerId
      );
      if (!conversation.isGroup)
        throw new ValidationError({ code: "NOT_A_GROUP" });
      const manage = decideManage(conversation.createdById, callerId);
      if (!manage.ok) refuse(manage);
      if (participantIds.includes(target)) return false;

      const capacity = decideAddCapacity(participantIds.length);
      if (!capacity.ok) refuse(capacity);
      if (
        (await tx.accountState(target)) !== "VERIFIED" ||
        (await tx.anyBlockWith(target, participantIds))
      ) {
        throw new ConflictError("PARTICIPANT_UNAVAILABLE");
      }
      // Joins read up to date: the backlog is history, not 200 unread messages (and rebuildUnread agrees).
      return tx.addParticipant(
        conversation.id,
        target,
        conversation.lastMessageSeq
      );
    });
    if (added) deps.observe?.("participant_added", args.conversationId);
    return { added };
  };
}

/** The creator removes anyone; any member removes themselves (leaves). The creator cannot leave: a group always has its admin. */
export function createRemoveParticipant(deps: Deps) {
  return async function removeParticipant(args: Args): Promise<void> {
    const caller = deps.authorize(args.actor, PERMISSIONS.MESSAGE_SEND);
    const callerId = caller.userId.toLowerCase();
    const target = args.userId.toLowerCase();

    await deps.store.transaction(async (tx) => {
      const { conversation, participantIds } = await requireParticipant(
        tx,
        args.conversationId,
        callerId
      );
      if (!conversation.isGroup)
        throw new ValidationError({ code: "NOT_A_GROUP" });
      if (target === callerId) {
        if (conversation.createdById === callerId)
          throw new ConflictError("CREATOR_CANNOT_LEAVE");
      } else {
        const manage = decideManage(conversation.createdById, callerId);
        if (!manage.ok) refuse(manage);
      }
      if (!participantIds.includes(target)) throw new NotFoundError();
      await tx.removeParticipant(conversation.id, target);
    });
    deps.observe?.("participant_removed", args.conversationId);
  };
}
