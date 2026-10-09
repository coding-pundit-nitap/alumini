import { PERMISSIONS } from "@nitap/database/permissions";

import type { Actor } from "@/modules/auth";

import {
  decodeAchievementCursor,
  encodeAchievementCursor,
} from "../domain/cursor";
import type { Authorize } from "./authz";
import type {
  AchievementsStore,
  PendingAchievementRow,
} from "./achievements-store";

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;
const clampLimit = (limit: number | undefined) =>
  Math.min(Math.max(1, limit ?? DEFAULT_LIMIT), MAX_LIMIT);

/**
 * Every SUBMITTED achievement across all users, for reviewers. Gated on `ACHIEVEMENT_REVIEW` and paged like
 * `listOwnAchievements`, over `(createdAt DESC, id DESC)`. Backs the "Pending Review" section on /achievements.
 */
export function createListPendingAchievements(deps: {
  store: AchievementsStore;
  authorize: Authorize;
}) {
  return async function listPendingAchievements(args: {
    actor: Actor | null;
    cursor?: string;
    limit?: number;
  }): Promise<{
    achievements: PendingAchievementRow[];
    nextCursor: string | null;
  }> {
    deps.authorize(args.actor, PERMISSIONS.ACHIEVEMENT_REVIEW);
    const limit = clampLimit(args.limit);
    const after = args.cursor ? decodeAchievementCursor(args.cursor) : null;
    const rows = await deps.store.transaction((tx) =>
      tx.listPending({ limit: limit + 1, after })
    );
    const more = rows.length > limit;
    const achievements = more ? rows.slice(0, limit) : rows;
    const last = achievements.at(-1);
    return {
      achievements,
      nextCursor:
        more && last
          ? encodeAchievementCursor({ createdAt: last.createdAt, id: last.id })
          : null,
    };
  };
}
