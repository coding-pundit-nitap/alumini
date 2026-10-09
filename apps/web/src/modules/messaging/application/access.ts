import { NotFoundError } from "@/lib/errors";

import type { ConversationRow, MessagingTx } from "./messaging-store";

/**
 * Locks the conversation and proves the caller may act inside it. Not a member, or a 1:1 whose other side has
 * blocked the caller, both read as NOT_FOUND: existence is not revealed.
 */
export async function requireParticipant(
  tx: MessagingTx,
  conversationId: string,
  userId: string
): Promise<{ conversation: ConversationRow; participantIds: string[] }> {
  const conversation = await tx.lockConversation(conversationId);
  if (!conversation) throw new NotFoundError();
  const participantIds = await tx.participantIds(conversation.id);
  const me = userId.toLowerCase();
  if (!participantIds.includes(me)) throw new NotFoundError();
  if (!conversation.isGroup) {
    const other = participantIds.find((id) => id !== me);
    const block = other ? await tx.blockBetween(me, other) : null;
    if (block && block.blockedById !== me) throw new NotFoundError();
  }
  return { conversation, participantIds };
}
