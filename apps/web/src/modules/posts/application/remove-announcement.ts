import { PERMISSIONS } from "@nitap/database/permissions";

import { NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import type { Authorize } from "./authz";
import type { PostsStore } from "./posts-store";

/** Any `announcement.publish` holder removes any announcement; soft-delete + audit. */
export function createRemoveAnnouncement(deps: {
  store: PostsStore;
  authorize: Authorize;
}) {
  return async function removeAnnouncement(args: {
    actor: Actor | null;
    postId: string;
  }): Promise<void> {
    const caller = deps.authorize(args.actor, PERMISSIONS.ANNOUNCEMENT_PUBLISH);
    await deps.store.transaction(async (tx) => {
      const post = await tx.findPost(args.postId, { forUpdate: true });
      if (!post || post.deleted || post.postType !== "ANNOUNCEMENT") {
        throw new NotFoundError();
      }
      await tx.softDeletePost(post.id);
      await tx.audit({
        action: "announcement.removed",
        actorId: caller.userId.toLowerCase(),
        postId: post.id,
      });
    });
  };
}
