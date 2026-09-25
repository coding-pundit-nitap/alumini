import { PERMISSIONS } from "@nitap/database/permissions";
import type { AnnouncementPublishedPayload } from "@nitap/jobs";

import { ConflictError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { announcementInput } from "../domain/posts";
import type { Authorize } from "./authz";
import type { PostsStore } from "./posts-store";
import { parse } from "./validation";

/**
 * Phase 12E (spec E-2, E-4, E-5). The only path that writes an ANNOUNCEMENT post. GLOBAL
 * `announcement.publish` only: a chapter-scoped grant does not match a resource-less check (XD-1).
 * Post, audit row and outbox event commit together; no `post.created` is emitted.
 */
export function createPublishAnnouncement(deps: {
  store: PostsStore;
  authorize: Authorize;
}) {
  return async function publishAnnouncement(args: {
    actor: Actor | null;
    input: unknown;
  }): Promise<{ postId: string }> {
    const caller = deps.authorize(args.actor, PERMISSIONS.ANNOUNCEMENT_PUBLISH);
    const input = parse(announcementInput, args.input);
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
        title: input.title,
        content: input.content,
        imageUrls,
        linkUrl: input.linkUrl ?? null,
        postType: "ANNOUNCEMENT",
      });
      await tx.audit({
        action: "announcement.published",
        actorId: authorId,
        postId: row.id,
      });
      await tx.enqueue({
        type: "announcement.published",
        payload: {
          v: 1,
          postId: row.id,
          authorId,
        } satisfies AnnouncementPublishedPayload,
      });
      return row;
    });
    return { postId: post.id };
  };
}
