import { PERMISSIONS } from "@nitap/database/permissions";
import type { PostCreatedPayload } from "@nitap/jobs";

import { ConflictError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { postInput } from "../domain/posts";
import type { Authorize } from "./authz";
import type { PostsStore } from "./posts-store";
import { parse } from "./validation";

/**
 * FR-FEED-001. Every `imageUrls` id must be a READY upload owned by the caller (C-4, mirrors
 * uploads' set-profile-photo.ts); an id that isn't refuses UPLOAD_NOT_READY. `postType` is always
 * `TEXT` here — `ACHIEVEMENT` is set only by `modules/achievements`' own publish path.
 */
export function createCreatePost(deps: {
  store: PostsStore;
  authorize: Authorize;
}) {
  return async function createPost(args: {
    actor: Actor | null;
    input: unknown;
  }): Promise<{ postId: string }> {
    const caller = deps.authorize(args.actor, PERMISSIONS.POST_CREATE);
    const input = parse(postInput, args.input);
    const authorId = caller.userId.toLowerCase();
    const imageUrls = input.imageUrls ?? [];

    const post = await deps.store.transaction(async (tx) => {
      if (
        imageUrls.length > 0 &&
        !(await tx.uploadsReady(imageUrls, authorId))
      ) {
        throw new ConflictError("UPLOAD_NOT_READY");
      }
      const row = await tx.insertPost({
        authorId,
        chapterId: null,
        content: input.content,
        imageUrls,
        linkUrl: input.linkUrl ?? null,
        postType: "TEXT",
      });
      await tx.enqueue({
        type: "post.created",
        payload: {
          v: 1,
          postId: row.id,
          authorId,
        } satisfies PostCreatedPayload,
      });
      return row;
    });
    return { postId: post.id };
  };
}
