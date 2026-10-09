import { PERMISSIONS } from "@nitap/database/permissions";

import { NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { decodeFeedCursor, encodeFeedCursor } from "../domain/cursor";
import type { Authorize } from "./authz";
import { clampLimit } from "./list-feed";
import type { CommentRow, PostsStore } from "./posts-store";

/** Comments on one non-deleted post, keyset-paged. */
export function createListComments(deps: {
  store: PostsStore;
  authorize: Authorize;
}) {
  return async function listComments(args: {
    actor: Actor | null;
    postId: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ comments: CommentRow[]; nextCursor: string | null }> {
    deps.authorize(args.actor, PERMISSIONS.POST_INTERACT);
    const limit = clampLimit(args.limit);
    const after = args.cursor ? decodeFeedCursor(args.cursor) : null;
    const rows = await deps.store.transaction(async (tx) => {
      const post = await tx.findPost(args.postId);
      if (!post || post.deleted) throw new NotFoundError();
      return tx.listComments({ postId: args.postId, limit: limit + 1, after });
    });
    const more = rows.length > limit;
    const comments = more ? rows.slice(0, limit) : rows;
    const last = comments.at(-1);
    return {
      comments,
      nextCursor:
        more && last
          ? encodeFeedCursor({ createdAt: last.createdAt, id: last.id })
          : null,
    };
  };
}
