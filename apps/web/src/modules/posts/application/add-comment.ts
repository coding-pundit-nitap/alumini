import { PERMISSIONS } from "@nitap/database/permissions";
import type { CommentCreatedPayload } from "@nitap/jobs";

import { NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { commentInput, decideInteract } from "../domain/posts";
import type { Authorize } from "./authz";
import type { CommentRow, PostsStore } from "./posts-store";
import { refuse } from "./refusal";
import { parse } from "./validation";

/** Blocked pairs and deleted posts both read as NOT_FOUND, so a block is never revealed. */
export function createAddComment(deps: {
  store: PostsStore;
  authorize: Authorize;
}) {
  return async function addComment(args: {
    actor: Actor | null;
    postId: string;
    input: unknown;
  }): Promise<CommentRow> {
    const caller = deps.authorize(args.actor, PERMISSIONS.POST_INTERACT);
    const input = parse(commentInput, args.input);
    const actorId = caller.userId.toLowerCase();
    return deps.store.transaction(async (tx) => {
      const post = await tx.findPost(args.postId);
      if (!post) throw new NotFoundError();
      const block = await tx.blockedBetween(actorId, post.authorId);
      const decision = decideInteract(post, block);
      if (!decision.ok) refuse(decision);
      const comment = await tx.insertComment({
        postId: post.id,
        authorId: actorId,
        body: input.body,
      });
      await tx.enqueue({
        type: "comment.created",
        payload: {
          v: 1,
          commentId: comment.id,
          postId: post.id,
          authorId: actorId,
        } satisfies CommentCreatedPayload,
      });
      return comment;
    });
  };
}
