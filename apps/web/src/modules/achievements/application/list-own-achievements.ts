import { PERMISSIONS } from "@nitap/database/permissions";

import type { Actor } from "@/modules/auth";

import {
  decodeAchievementCursor,
  encodeAchievementCursor,
} from "../domain/cursor";
import type { Authorize } from "./authz";
import type { AchievementRow, AchievementsStore } from "./achievements-store";

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;
const clampLimit = (limit: number | undefined) =>
  Math.min(Math.max(1, limit ?? DEFAULT_LIMIT), MAX_LIMIT);

/**
 * Own-content read. There is no separate read permission for achievements, so this reuses
 * `ACHIEVEMENT_SUBMIT` (own-content: a member reads only their own submissions). Keyset-paged over
 * `(createdAt DESC, id DESC)`, same shape as posts' feed.
 */
export function createListOwnAchievements(deps: {
  store: AchievementsStore;
  authorize: Authorize;
}) {
  return async function listOwnAchievements(args: {
    actor: Actor | null;
    cursor?: string;
    limit?: number;
  }): Promise<{ achievements: AchievementRow[]; nextCursor: string | null }> {
    const caller = deps.authorize(args.actor, PERMISSIONS.ACHIEVEMENT_SUBMIT);
    const limit = clampLimit(args.limit);
    const after = args.cursor ? decodeAchievementCursor(args.cursor) : null;
    const rows = await deps.store.transaction((tx) =>
      tx.listOwn(caller.userId.toLowerCase(), { limit: limit + 1, after })
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
