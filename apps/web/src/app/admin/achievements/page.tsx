import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { reviewAchievementAction } from "@/app/achievements/actions";
import { listPendingAchievements } from "@/composition/achievements";
import { AppError } from "@/lib/errors";
import { AchievementList } from "@/modules/achievements";
import { can, getActor, PERMISSIONS } from "@/modules/auth";

export const metadata: Metadata = { title: "Achievements awaiting review" };

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

/** FR-ACH reviewer queue under the admin shell (spec C12-9). 404 without achievement.review (AD-5). */
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
      <h1 className="text-2xl font-semibold">Achievements awaiting review</h1>
      <AchievementList
        achievements={page.achievements}
        isReviewer={true}
        onReview={reviewAchievementAction}
      />
      {page.nextCursor ? (
        <Link
          href={`/admin/achievements?cursor=${encodeURIComponent(page.nextCursor)}`}
          className="text-sm underline"
        >
          Next
        </Link>
      ) : null}
    </div>
  );
}
