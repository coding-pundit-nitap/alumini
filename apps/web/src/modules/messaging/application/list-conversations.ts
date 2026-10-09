import { PERMISSIONS } from "@nitap/database/permissions";

import type { Actor } from "@/modules/auth";

import { decodeSeqCursor, encodeSeqCursor } from "../domain/cursor";
import type { Authorize } from "./authz";
import type {
  ListedConversation,
  MessagingQueries,
  Page,
} from "./messaging-store";

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;

export const clampLimit = (limit: number | undefined) =>
  Math.min(Math.max(1, limit ?? DEFAULT_LIMIT), MAX_LIMIT);

/** Fetch `limit + 1`, trim, and cursor on the last kept row's seq. */
export function pageOf<T>(
  rows: T[],
  limit: number,
  seqOf: (row: T) => string
): Page<T> {
  const more = rows.length > limit;
  const data = more ? rows.slice(0, limit) : rows;
  const last = data.at(-1);
  return {
    data,
    page: {
      limit,
      nextCursor: more && last ? encodeSeqCursor(seqOf(last)) : null,
      hasMore: more,
    },
  };
}

/** The caller's inbox, newest activity first. */
export function createListConversations(deps: {
  queries: MessagingQueries;
  authorize: Authorize;
}) {
  return async function listConversations(args: {
    actor: Actor | null;
    limit?: number;
    cursor?: string;
  }): Promise<Page<ListedConversation>> {
    const caller = deps.authorize(args.actor, PERMISSIONS.MESSAGE_SEND);
    const limit = clampLimit(args.limit);
    const rows = await deps.queries.listConversations(
      caller.userId.toLowerCase(),
      {
        limit: limit + 1,
        before: args.cursor ? decodeSeqCursor(args.cursor) : undefined,
      }
    );
    return pageOf(rows, limit, (row) => row.lastMessageSeq);
  };
}
