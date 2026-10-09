import { PERMISSIONS } from "@nitap/database/permissions";

import { ConflictError, NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { decideOwn, postEditInput } from "../domain/posts";
import type { Authorize } from "./authz";
import type { PostsStore } from "./posts-store";
import { refuse } from "./refusal";
import { parse } from "./validation";

/**
 * "edit own post". The author replaces the text of their own TEXT post; images and the link stay.
 * Achievement posts carry reviewed content and announcements are audited, so neither is editable here (both
 * read as NOT_FOUND, like delete-post's announcement case). A report keeps no copy of the content, so an
 * edit while a report is open would rewrite the evidence: refused with POST_UNDER_REVIEW until it is decided.
 */
export function createUpdatePost(deps: {
  store: PostsStore;
  authorize: Authorize;
}) {
  return async function updatePost(args: {
    actor: Actor | null;
    postId: string;
    input: unknown;
  }): Promise<void> {
    const caller = deps.authorize(args.actor, PERMISSIONS.POST_CREATE);
    const input = parse(postEditInput, args.input);
    const actorId = caller.userId.toLowerCase();
    await deps.store.transaction(async (tx) => {
      const post = await tx.findPost(args.postId, { forUpdate: true });
      if (!post || post.deleted || post.postType !== "TEXT") {
        throw new NotFoundError();
      }
      const decision = decideOwn(post.authorId, actorId);
      if (!decision.ok) refuse(decision);
      if (await tx.openReportExists(post.id)) {
        throw new ConflictError("POST_UNDER_REVIEW");
      }
      if (input.content === post.content) return;
      await tx.updatePostContent(post.id, input.content);
    });
  };
}
