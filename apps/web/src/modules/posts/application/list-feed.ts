import { PERMISSIONS } from "@nitap/database/permissions";

import type { Actor } from "@/modules/auth";

import { decodeFeedCursor, encodeFeedCursor } from "../domain/cursor";
import type { Authorize } from "./authz";
import type { FeedPost, PostsStore } from "./posts-store";

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;
export const clampLimit = (limit: number | undefined) =>
  Math.min(Math.max(1, limit ?? DEFAULT_LIMIT), MAX_LIMIT);

/**
 * Every verified member sees every non-deleted post; reuses `POST_INTERACT` as
 * the read permission.
 */
export function createListFeed(deps: {
  store: PostsStore;
  authorize: Authorize;
}) {
  return async function listFeed(args: {
    actor: Actor | null;
    cursor?: string;
    limit?: number;
  }): Promise<{ posts: FeedPost[]; nextCursor: string | null }> {
    const caller = deps.authorize(args.actor, PERMISSIONS.POST_INTERACT);
    const limit = clampLimit(args.limit);
    const after = args.cursor ? decodeFeedCursor(args.cursor) : null;
    const rows = await deps.store.transaction((tx) =>
      tx.listFeed({
        limit: limit + 1,
        after,
        viewerId: caller.userId.toLowerCase(),
      })
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
