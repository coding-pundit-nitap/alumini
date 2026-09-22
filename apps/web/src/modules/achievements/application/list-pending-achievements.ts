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
 * FR-ACH reviewer-queue read: every SUBMITTED achievement across all users, gating on
 * `ACHIEVEMENT_REVIEW` (not `ACHIEVEMENT_SUBMIT`, own-content, like `listOwnAchievements`). Same
 * keyset-paged shape over `(createdAt DESC, id DESC)` as `listOwnAchievements`. There is no dedicated
 * reviewer queue page this phase (plan's explicit design intent) — this backs the "Pending Review"
 * section rendered inline on /achievements for actors holding the review permission.
 */
export function createListPendingAchievements(deps: {
  store: AchievementsStore;
  authorize: Authorize;
}) {
  return async function listPendingAchievements(args: {
    actor: Actor | null;
    cursor?: string;
    limit?: number;
  }): Promise<{ achievements: AchievementRow[]; nextCursor: string | null }> {
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
