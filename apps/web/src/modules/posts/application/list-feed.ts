import { PERMISSIONS } from "@nitap/database/permissions";

import type { Actor } from "@/modules/auth";

import { decodeFeedCursor, encodeFeedCursor } from "../domain/cursor";
import type { Authorize } from "./authz";
import type { PostRow, PostsStore } from "./posts-store";

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;
export const clampLimit = (limit: number | undefined) =>
  Math.min(Math.max(1, limit ?? DEFAULT_LIMIT), MAX_LIMIT);

/**
 * FR-FEED-002/004. Every verified member sees every non-deleted post — there is no separate read
 * permission, so this reuses `POST_INTERACT`'s member baseline. Keyset-paged over
 * `(createdAt DESC, id DESC)` (C-6): fetches `limit + 1` rows and trims to detect `nextCursor`.
 */
export function createListFeed(deps: {
  store: PostsStore;
  authorize: Authorize;
}) {
  return async function listFeed(args: {
    actor: Actor | null;
    cursor?: string;
    limit?: number;
  }): Promise<{ posts: PostRow[]; nextCursor: string | null }> {
    deps.authorize(args.actor, PERMISSIONS.POST_INTERACT);
    const limit = clampLimit(args.limit);
    const after = args.cursor ? decodeFeedCursor(args.cursor) : null;
    const rows = await deps.store.transaction((tx) =>
      tx.listFeed({ limit: limit + 1, after })
    );
    const more = rows.length > limit;
    const posts = more ? rows.slice(0, limit) : rows;
    const last = posts.at(-1);
    return {
      posts,
      nextCursor:
        more && last
          ? encodeFeedCursor({ createdAt: last.createdAt, id: last.id })
          : null,
    };
  };
}
