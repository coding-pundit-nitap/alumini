import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { reviewAchievementAction } from "@/app/(app)/achievements/actions";
import { AdminPageHeader, AdminPager } from "@/components/admin/admin-surface";
import { listPendingAchievements } from "@/composition/achievements";
import { AppError } from "@/lib/errors";
import { AchievementList } from "@/modules/achievements";
import { can, getActor, PERMISSIONS } from "@/modules/auth";

export const metadata: Metadata = { title: "Achievements awaiting review" };

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

/** Reviewer queue under the admin shell. 404 without achievement.review. */
export default async function AdminAchievementsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const actor = await getActor();
  if (!can(actor, PERMISSIONS.ACHIEVEMENT_REVIEW)) notFound();
  const cursor = first((await searchParams).cursor);

  let page;
  try {
    page = await listPendingAchievements({ actor, cursor });
  } catch (error) {
    if (error instanceof AppError && error.code === "INVALID_CURSOR")
      redirect("/admin/achievements");
    throw error;
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <AdminPageHeader
        title="Achievements awaiting review"
        description="Member wins waiting to be published."
      />
      <div className="bg-card overflow-hidden rounded-xl border">
        <AchievementList
          achievements={page.achievements}
          isReviewer={true}
          onReview={reviewAchievementAction}
        />
      </div>
      <AdminPager
        href={
          page.nextCursor
            ? `/admin/achievements?cursor=${encodeURIComponent(page.nextCursor)}`
            : null
        }
        label="Next"
      />
    </div>
  );
}
