"use server";

import { refresh } from "next/cache";

import { runAction } from "@/app/_actions/run-action";
import {
  reviewAchievement,
  submitAchievement,
  withdrawAchievement,
} from "@/composition/achievements";
import type { ActionResult } from "@/lib/action-result";
import { ValidationError } from "@/lib/errors";
import { getActor } from "@/modules/auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseId(field: string, value: string): string {
  if (!UUID.test(value)) {
    throw new ValidationError({
      details: [{ field, code: "INVALID", message: "That was not found." }],
    });
  }
  return value;
}

/** Achievement Server Actions. Mirrors app/feed/actions.ts's wrapper pattern. */
export async function submitAchievementAction(
  input: unknown
): Promise<ActionResult<{ achievementId: string }>> {
  return runAction(async () => {
    const result = await submitAchievement({ actor: await getActor(), input });
    refresh();
    return result;
  });
}

export async function withdrawAchievementAction(
  achievementId: string
): Promise<ActionResult<Record<string, never>>> {
  return runAction(async () => {
    await withdrawAchievement({
      actor: await getActor(),
      achievementId: parseId("achievementId", achievementId),
    });
    refresh();
    return {};
  });
}

export async function reviewAchievementAction(
  achievementId: string,
  outcome: "approve" | "reject"
): Promise<ActionResult<Record<string, never>>> {
  return runAction(async () => {
    if (outcome !== "approve" && outcome !== "reject") {
      throw new ValidationError();
    }
    await reviewAchievement({
      actor: await getActor(),
      achievementId: parseId("achievementId", achievementId),
      outcome,
    });
    refresh();
    return {};
  });
}
