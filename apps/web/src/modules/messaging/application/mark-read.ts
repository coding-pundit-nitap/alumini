import { PERMISSIONS } from "@nitap/database/permissions";

import type { Actor } from "@/modules/auth";

import { readInput } from "../domain/messaging";
import { requireParticipant } from "./access";
import type { Authorize } from "./authz";
import type { MessagingObserver, MessagingStore } from "./messaging-store";
import { parse } from "./validation";

/**
 * FR-MSG-002. Moves the caller's read marker to `upToSeq` (clamped to the last message, never backwards) and
 * recounts their unread messages. Marking up to what the client actually displayed, not "everything", means a
 * message that arrives meanwhile stays unread.
 */
export function createMarkRead(deps: {
  store: MessagingStore;
  authorize: Authorize;
  observe?: MessagingObserver;
  /** Best-effort, after commit and outside the transaction (e.g. clears the notification debounce window). */
  onRead?: (userId: string, conversationId: string) => Promise<void>;
}) {
  return async function markRead(args: {
    actor: Actor | null;
    conversationId: string;
    input: unknown;
  }): Promise<void> {
    const caller = deps.authorize(args.actor, PERMISSIONS.MESSAGE_SEND);
    const input = parse(readInput, args.input);
    const userId = caller.userId.toLowerCase();
    await deps.store.transaction(async (tx) => {
      const { conversation } = await requireParticipant(
        tx,
        args.conversationId,
        userId
      );
      await tx.markRead(conversation.id, userId, input.upToSeq);
    });
    try {
      await deps.onRead?.(userId, args.conversationId);
    } catch {
      // Never fail a committed mark-read over a cache hiccup; the window just expires by TTL.
    }
    deps.observe?.("read", args.conversationId);
  };
}
