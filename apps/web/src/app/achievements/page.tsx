import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { listOwnAchievements } from "@/composition/achievements";
import { AppError } from "@/lib/errors";
import { getActor } from "@/modules/auth";

export const metadata: Metadata = { title: "Your achievements" };

/** Minimal proof of wiring only (Task 11): plain output, no shadcn UI. Task 13 builds the real page. */
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
      <ul className="space-y-4">
        {page.achievements.map((achievement) => (
          <li key={achievement.id} className="border-b pb-4">
            <p className="font-medium">{achievement.title}</p>
            <p className="text-muted-foreground text-sm">
              {achievement.status}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
