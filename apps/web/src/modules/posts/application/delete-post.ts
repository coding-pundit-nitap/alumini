import { PERMISSIONS } from "@nitap/database/permissions";

import { NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { decideOwn } from "../domain/posts";
import type { Authorize } from "./authz";
import type { PostsStore } from "./posts-store";
import { refuse } from "./refusal";

/** FR-FEED-003. Own-content delete needs no separate permission (mirrors messaging's own-delete pattern). Soft-delete only, never a hard delete or content redaction (C-9). */
export function createDeletePost(deps: {
  store: PostsStore;
  authorize: Authorize;
}) {
  return async function deletePost(args: {
    actor: Actor | null;
    postId: string;
  }): Promise<void> {
    const caller = deps.authorize(args.actor, PERMISSIONS.POST_CREATE);
    const actorId = caller.userId.toLowerCase();
    await deps.store.transaction(async (tx) => {
      const post = await tx.findPost(args.postId);
      if (!post || post.deleted) throw new NotFoundError();
      const decision = decideOwn(post.authorId, actorId);
      if (!decision.ok) refuse(decision);
      await tx.softDeletePost(post.id);
    });
  };
}
