// apps/web/src/modules/messaging/application/list-messages.ts
import { PERMISSIONS } from "@nitap/database/permissions";

import { NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { decodeSeqCursor } from "../domain/cursor";
import type { Authorize } from "./authz";
import { clampLimit, pageOf } from "./list-conversations";
import type { ListedMessage, MessagingQueries, Page } from "./messaging-store";

/** FR-MSG-001: a conversation's messages, newest first, keyset-paged on `seq`. */
export function createListMessages(deps: {
  queries: MessagingQueries;
  authorize: Authorize;
}) {
  return async function listMessages(args: {
    actor: Actor | null;
    conversationId: string;
    limit?: number;
    cursor?: string;
  }): Promise<Page<ListedMessage>> {
    const caller = deps.authorize(args.actor, PERMISSIONS.MESSAGE_SEND);
    const limit = clampLimit(args.limit);
    const rows = await deps.queries.listMessages(
      caller.userId.toLowerCase(),
      args.conversationId.toLowerCase(),
      {
        limit: limit + 1,
        before: args.cursor ? decodeSeqCursor(args.cursor) : undefined,
      }
    );
    if (!rows) throw new NotFoundError();
    return pageOf(rows, limit, (row) => row.seq);
  };
}
