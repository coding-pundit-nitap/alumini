import { NotFoundError } from "@/lib/errors";

import type { ConversationRow, MessagingTx } from "./messaging-store";

/** Locks the conversation and checks membership. Non-members and blocked callers get NOT_FOUND. */
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
