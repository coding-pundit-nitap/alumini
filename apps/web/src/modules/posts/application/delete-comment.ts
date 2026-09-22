import { PERMISSIONS } from "@nitap/database/permissions";

import { NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { decideOwn } from "../domain/posts";
import type { Authorize } from "./authz";
import type { PostsStore } from "./posts-store";
import { refuse } from "./refusal";

/** Mirrors delete-post at comment granularity: own-content delete, soft-delete only. */
export function createDeleteComment(deps: {
  store: PostsStore;
  authorize: Authorize;
}) {
  return async function deleteComment(args: {
    actor: Actor | null;
    commentId: string;
  }): Promise<void> {
    const caller = deps.authorize(args.actor, PERMISSIONS.POST_INTERACT);
    const actorId = caller.userId.toLowerCase();
    await deps.store.transaction(async (tx) => {
      const comment = await tx.findComment(args.commentId);
      if (!comment || comment.deleted) throw new NotFoundError();
      const decision = decideOwn(comment.authorId, actorId);
      if (!decision.ok) refuse(decision);
      await tx.softDeleteComment(comment.id);
    });
  };
}
