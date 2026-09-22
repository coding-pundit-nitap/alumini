import { PERMISSIONS } from "@nitap/database/permissions";
import type { ReactionAddedPayload } from "@nitap/jobs";

import { NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { decideInteract, reactInput } from "../domain/posts";
import type { Authorize } from "./authz";
import type { PostsStore } from "./posts-store";
import { refuse } from "./refusal";
import { parse } from "./validation";

/**
 * `upsertReaction` is a DB-level upsert on `uq_reaction_per_user`, replacing any prior reaction type
 * in one atomic operation — never "delete then insert", which would race under concurrency.
 */
export function createReact(deps: { store: PostsStore; authorize: Authorize }) {
  return async function react(args: {
    actor: Actor | null;
    postId: string;
    input: unknown;
  }): Promise<void> {
    const caller = deps.authorize(args.actor, PERMISSIONS.POST_INTERACT);
    const input = parse(reactInput, args.input);
    const actorId = caller.userId.toLowerCase();
    await deps.store.transaction(async (tx) => {
      const post = await tx.findPost(args.postId);
      if (!post) throw new NotFoundError();
      const block = await tx.blockedBetween(actorId, post.authorId);
      const decision = decideInteract(post, block, actorId);
      if (!decision.ok) refuse(decision);
      await tx.upsertReaction({
        postId: post.id,
        userId: actorId,
        type: input.type,
      });
      await tx.enqueue({
        type: "reaction.added",
        payload: {
          v: 1,
          postId: post.id,
          userId: actorId,
          type: input.type,
        } satisfies ReactionAddedPayload,
      });
    });
  };
}
