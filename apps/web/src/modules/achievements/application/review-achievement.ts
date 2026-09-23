import { PERMISSIONS } from "@nitap/database/permissions";
import type {
  AchievementApprovedPayload,
  AchievementRejectedPayload,
} from "@nitap/jobs";

import { NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { decideTransition } from "../domain/achievement";
import type { Authorize } from "./authz";
import type { AchievementsStore } from "./achievements-store";
import { refuse } from "./refusal";

/**
 * FR-ACH-003, spec C-12. Approve publishes: `tx.publishAsPost` and `tx.patchAchievement` run inside the
 * SAME transaction as the store's `.transaction()` call, so a mid-transaction failure leaves neither the
 * achievement's status changed nor any post created (no orphaned PUBLISHED without a post, and vice versa).
 */
export function createReviewAchievement(deps: {
  store: AchievementsStore;
  authorize: Authorize;
}) {
  return async function reviewAchievement(args: {
    actor: Actor | null;
    achievementId: string;
    outcome: "approve" | "reject";
  }): Promise<void> {
    const caller = deps.authorize(args.actor, PERMISSIONS.ACHIEVEMENT_REVIEW);
    const reviewerId = caller.userId.toLowerCase();

    await deps.store.transaction(async (tx) => {
      const row = await tx.findAchievement(args.achievementId);
      if (!row) throw new NotFoundError();
      const decision = decideTransition(
        row,
        reviewerId,
        { action: "review", outcome: args.outcome },
        true
      );
      if (!decision.ok) refuse(decision);

      if (args.outcome === "approve") {
        const { postId } = await tx.publishAsPost(row.id, {
          authorId: row.userId,
          title: row.title,
          description: row.description,
        });
        await tx.patchAchievement(row.id, {
          ...decision.patch,
          reviewedById: reviewerId,
          publishedPostId: postId,
        });
        await tx.enqueue({
          type: "achievement.approved",
          payload: {
            v: 1,
            achievementId: row.id,
            userId: row.userId,
            postId,
          } satisfies AchievementApprovedPayload,
        });
      } else {
        await tx.patchAchievement(row.id, {
          ...decision.patch,
          reviewedById: reviewerId,
        });
        await tx.enqueue({
          type: "achievement.rejected",
          payload: {
            v: 1,
            achievementId: row.id,
            userId: row.userId,
          } satisfies AchievementRejectedPayload,
        });
      }
      await tx.audit({
        action:
          args.outcome === "approve"
            ? "achievement.approved"
            : "achievement.rejected",
        actorId: reviewerId,
        achievementId: row.id,
        ownerId: row.userId,
      });
    });
  };
}
