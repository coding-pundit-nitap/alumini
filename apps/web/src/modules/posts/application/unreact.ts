import { PERMISSIONS } from "@nitap/database/permissions";

import { NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { decideInteract } from "../domain/posts";
import type { Authorize } from "./authz";
import type { PostsStore } from "./posts-store";
import { refuse } from "./refusal";

/** Removes the caller's reaction row, if any. Not an error to unreact when there was nothing to remove. */
export function createUnreact(deps: {
  store: PostsStore;
  authorize: Authorize;
}) {
  return async function unreact(args: {
    actor: Actor | null;
    postId: string;
  }): Promise<void> {
    const caller = deps.authorize(args.actor, PERMISSIONS.POST_INTERACT);
    const actorId = caller.userId.toLowerCase();
    await deps.store.transaction(async (tx) => {
      const post = await tx.findPost(args.postId);
      if (!post) throw new NotFoundError();
      const block = await tx.blockedBetween(actorId, post.authorId);
      const decision = decideInteract(post, block, actorId);
      if (!decision.ok) refuse(decision);
      await tx.deleteReaction(post.id, actorId);
    });
  };
}
