import { PERMISSIONS } from "@nitap/database/permissions";

import { NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { decideTransition } from "../domain/achievement";
import type { Authorize } from "./authz";
import type { AchievementsStore } from "./achievements-store";
import { refuse } from "./refusal";

/** FR-ACH-002. Own-content withdraw needs no separate permission (mirrors posts' own-delete pattern); only while SUBMITTED (C-7). */
export function createWithdrawAchievement(deps: {
  store: AchievementsStore;
  authorize: Authorize;
}) {
  return async function withdrawAchievement(args: {
    actor: Actor | null;
    achievementId: string;
  }): Promise<void> {
    const caller = deps.authorize(args.actor, PERMISSIONS.ACHIEVEMENT_SUBMIT);
    const actorId = caller.userId.toLowerCase();
    await deps.store.transaction(async (tx) => {
      const row = await tx.findAchievement(args.achievementId);
      if (!row) throw new NotFoundError();
      const decision = decideTransition(
        row,
        actorId,
        { action: "withdraw" },
        false
      );
      if (!decision.ok) refuse(decision);
      await tx.patchAchievement(row.id, decision.patch);
    });
  };
}
