import { PERMISSIONS } from "@nitap/database/permissions";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { reviewAchievementAction, submitAchievementAction } from "./actions";
import {
  listOwnAchievements,
  listPendingAchievements,
} from "@/composition/achievements";
import { AppError } from "@/lib/errors";
import { can, getActor } from "@/modules/auth";
import { AchievementForm, AchievementList } from "@/modules/achievements";

export const metadata: Metadata = { title: "Your achievements" };

export default async function AchievementsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { cursor } = await searchParams;
  const actor = await getActor();
  if (!actor) redirect("/login?next=%2Fachievements");

  const canSubmit = can(actor, PERMISSIONS.ACHIEVEMENT_SUBMIT);
  let page = null;
  if (canSubmit) {
    try {
      page = await listOwnAchievements({ actor, cursor });
    } catch (error) {
      if (error instanceof AppError && error.code === "INVALID_CURSOR") {
        redirect("/achievements");
      }
      throw error;
    }
  }

  const isReviewer = can(actor, PERMISSIONS.ACHIEVEMENT_REVIEW);
  const pending = isReviewer ? await listPendingAchievements({ actor }) : null;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">Your achievements</h1>
      {canSubmit ? (
        <>
          <AchievementForm onSubmit={submitAchievementAction} />
          {/*
           * `listOwnAchievements` only ever returns the caller's own submissions, and a reviewer may
           * never review their own (SELF_REVIEW_FORBIDDEN, C-7) — so this list never shows the review
           * affordance. A reviewer who lacks `achievement.submit` (e.g. ALUMNI_COORDINATOR) has nothing
           * of their own to submit or list, so this section is skipped entirely for them rather than
           * calling `listOwnAchievements`, which would 403.
           */}
          <AchievementList
            achievements={page!.achievements}
            isReviewer={false}
          />
        </>
      ) : null}

      {pending ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Pending review</h2>
          {/*
           * There is no dedicated reviewer queue page this phase (plan's explicit design intent) — the
           * review affordance lives inline on the same /achievements page everyone sees, backed by
           * `listPendingAchievements` (every SUBMITTED achievement, any user).
           */}
          <AchievementList
            achievements={pending.achievements}
            isReviewer={true}
            onReview={reviewAchievementAction}
          />
        </section>
      ) : null}
    </div>
  );
}
