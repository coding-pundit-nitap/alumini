import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { submitAchievementAction } from "./actions";
import { listOwnAchievements } from "@/composition/achievements";
import { AppError } from "@/lib/errors";
import { getActor } from "@/modules/auth";
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

  let page;
  try {
    page = await listOwnAchievements({ actor, cursor });
  } catch (error) {
    if (error instanceof AppError && error.code === "INVALID_CURSOR") {
      redirect("/achievements");
    }
    throw error;
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">Your achievements</h1>
      <AchievementForm onSubmit={submitAchievementAction} />
      {/*
       * `listOwnAchievements` only ever returns the caller's own submissions, and a reviewer may never
       * review their own (SELF_REVIEW_FORBIDDEN, C-7) — so this list never shows the review affordance.
       * There is no reviewer queue page this phase; AchievementList itself supports `isReviewer` for
       * wherever a reviewer's OWN view of someone else's achievement becomes visible later.
       */}
      <AchievementList achievements={page.achievements} isReviewer={false} />
    </div>
  );
}
