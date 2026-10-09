import { PERMISSIONS } from "@nitap/database/permissions";
import type { AchievementSubmittedPayload } from "@nitap/jobs";

import type { Actor } from "@/modules/auth";

import { achievementInput } from "../domain/achievement";
import type { Authorize } from "./authz";
import type { AchievementsStore } from "./achievements-store";
import { parse } from "./validation";

export function createSubmitAchievement(deps: {
  store: AchievementsStore;
  authorize: Authorize;
}) {
  return async function submitAchievement(args: {
    actor: Actor | null;
    input: unknown;
  }): Promise<{ achievementId: string }> {
    const caller = deps.authorize(args.actor, PERMISSIONS.ACHIEVEMENT_SUBMIT);
    const input = parse(achievementInput, args.input);
    const userId = caller.userId.toLowerCase();

    const row = await deps.store.transaction(async (tx) => {
      const created = await tx.insertAchievement({
        userId,
        title: input.title,
        description: input.description,
        category: input.category,
      });
      await tx.enqueue({
        type: "achievement.submitted",
        payload: {
          v: 1,
          achievementId: created.id,
          userId,
        } satisfies AchievementSubmittedPayload,
      });
      return created;
    });
    return { achievementId: row.id };
  };
}
