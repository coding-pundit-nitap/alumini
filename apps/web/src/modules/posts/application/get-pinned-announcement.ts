import { PERMISSIONS } from "@nitap/database/permissions";

import type { Actor } from "@/modules/auth";

import type { Authorize } from "./authz";
import type { FeedPost, PostsStore } from "./posts-store";

export const PIN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** The newest live announcement from the last 7 days, for the top of the feed. */
export function createGetPinnedAnnouncement(deps: {
  store: PostsStore;
  authorize: Authorize;
  now?: () => Date;
}) {
  const now = deps.now ?? (() => new Date());
  return async function getPinnedAnnouncement(args: {
    actor: Actor | null;
  }): Promise<FeedPost | null> {
    const caller = deps.authorize(args.actor, PERMISSIONS.POST_INTERACT);
    const since = new Date(now().getTime() - PIN_WINDOW_MS);
    return deps.store.transaction((tx) =>
      tx.findPinnedAnnouncement({
        since,
        viewerId: caller.userId.toLowerCase(),
      })
    );
  };
}
