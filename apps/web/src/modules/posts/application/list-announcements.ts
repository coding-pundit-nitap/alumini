import { PERMISSIONS } from "@nitap/database/permissions";

import type { Actor } from "@/modules/auth";

import { decodeFeedCursor, encodeFeedCursor } from "../domain/cursor";
import type { Authorize } from "./authz";
import type { PostAuthor, PostRow, PostsStore } from "./posts-store";

const PAGE = 20;

/** Phase 12E admin list (spec E-9): live announcements, newest first. */
export function createListAnnouncements(deps: {
  store: PostsStore;
  authorize: Authorize;
}) {
  return async function listAnnouncements(args: {
    actor: Actor | null;
    cursor?: string;
  }): Promise<{
    announcements: (PostRow & { author: PostAuthor })[];
    nextCursor: string | null;
  }> {
    deps.authorize(args.actor, PERMISSIONS.ANNOUNCEMENT_PUBLISH);
    const after = args.cursor ? decodeFeedCursor(args.cursor) : null;
    const rows = await deps.store.transaction((tx) =>
      tx.listAnnouncements({ limit: PAGE + 1, after })
    );
    const more = rows.length > PAGE;
    const announcements = more ? rows.slice(0, PAGE) : rows;
    const last = announcements.at(-1);
    return {
      announcements,
      nextCursor:
        more && last
          ? encodeFeedCursor({ createdAt: last.createdAt, id: last.id })
          : null,
    };
  };
}
