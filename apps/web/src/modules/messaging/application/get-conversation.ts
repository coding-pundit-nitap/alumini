// apps/web/src/modules/messaging/application/get-conversation.ts
import { PERMISSIONS } from "@nitap/database/permissions";

import { NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import type { Authorize } from "./authz";
import type { ConversationDetail, MessagingQueries } from "./messaging-store";

export function createGetConversation(deps: {
  queries: MessagingQueries;
  authorize: Authorize;
}) {
  return async function getConversation(args: {
    actor: Actor | null;
    conversationId: string;
  }): Promise<ConversationDetail> {
    const caller = deps.authorize(args.actor, PERMISSIONS.MESSAGE_SEND);
    const detail = await deps.queries.getConversation(
      caller.userId.toLowerCase(),
      args.conversationId.toLowerCase()
    );
    if (!detail) throw new NotFoundError();
    return detail;
  };
}
