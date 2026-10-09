import { PERMISSIONS } from "@nitap/database/permissions";

import { NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import type { Authorize } from "./authz";
import type { FeedPost, PostsStore } from "./posts-store";

/** Single-post read of the enriched feed model. */
export function createGetPost(deps: {
  store: PostsStore;
  authorize: Authorize;
}) {
  return async function getPost(args: {
    actor: Actor | null;
    postId: string;
  }): Promise<FeedPost> {
    const caller = deps.authorize(args.actor, PERMISSIONS.POST_INTERACT);
    const post = await deps.store.transaction((tx) =>
      tx.findFeedPost(args.postId, caller.userId.toLowerCase())
    );
    if (!post) throw new NotFoundError();
    return post;
  };
}
