import { PERMISSIONS } from "@nitap/database/permissions";
import { ClipboardCheck, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonVariants } from "@nitap/ui/components/button";

import {
  reviewAchievementAction,
  submitAchievementAction,
  withdrawAchievementAction,
} from "./actions";
import { PageColumns } from "@/components/shell/page-columns";
import {
  listOwnAchievements,
  listPendingAchievements,
} from "@/composition/achievements";
import { AppError } from "@/lib/errors";
import { can, getActor } from "@/modules/auth";
import { AchievementForm, AchievementList } from "@/modules/achievements";

export const metadata: Metadata = { title: "Your achievements" };

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="px-4 pt-6 pb-1 font-semibold tracking-tight sm:px-5">
      {children}
    </h2>
  );
}

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
    <PageColumns
      header={
        <>
          <div className="min-w-0 flex-1 leading-tight">
            <h1 className="truncate font-semibold tracking-tight">
              Achievements
            </h1>
            <p className="text-muted-foreground truncate text-xs">
              Wins from the NIT AP community, shared on the feed
            </p>
          </div>
          {isReviewer ? (
            <Link
              href="/admin/achievements"
              className={buttonVariants({
                variant: "outline",
                size: "sm",
                className: "rounded-full",
              })}
            >
              <ClipboardCheck aria-hidden />
              <span className="hidden sm:inline">Open review queue</span>
              <span className="sm:hidden">Queue</span>
            </Link>
          ) : null}
        </>
      }
    >
      {canSubmit && page ? (
        <>
          <div id="share" className="scroll-mt-28 border-b px-4 py-5 sm:px-5">
            <AchievementForm onSubmit={submitAchievementAction} />
          </div>
          {/*
           * `listOwnAchievements` only ever returns the caller's own submissions, and a reviewer may
           * never review their own (SELF_REVIEW_FORBIDDEN) — so this list never shows the review
           * affordance. A reviewer who lacks `achievement.submit` (e.g. ALUMNI_COORDINATOR) has nothing
           * of their own to submit or list, so this section is skipped entirely for them rather than
           * calling `listOwnAchievements`, which would 403.
           */}
          <section className="border-b">
            <SectionTitle>Your achievements</SectionTitle>
            <AchievementList
              achievements={page.achievements}
              isReviewer={false}
              onWithdraw={withdrawAchievementAction}
              emptyText="No achievements yet. Share your first one above."
              olderHref={
                page.nextCursor
                  ? `/achievements?cursor=${encodeURIComponent(page.nextCursor)}`
                  : null
              }
            />
          </section>
        </>
      ) : null}

      {pending ? (
        <section className="border-b">
          <SectionTitle>Pending review</SectionTitle>
          {/* The full queue, with paging, is /admin/achievements; this is its first page inline. */}
          <AchievementList
            achievements={pending.achievements}
            isReviewer={true}
            onReview={reviewAchievementAction}
            emptyText="Nothing is waiting for review."
          />
        </section>
      ) : null}

      {!canSubmit && !isReviewer ? (
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
            <Trophy aria-hidden className="size-5" />
          </span>
          <p className="text-muted-foreground max-w-xs text-sm">
            Alumni share their wins here. Approved achievements appear in your
            feed.
          </p>
          <Link
            href="/dashboard"
            className={buttonVariants({
              variant: "outline",
              size: "sm",
              className: "rounded-full",
            })}
          >
            Go to your feed
          </Link>
        </div>
      ) : null}
    </PageColumns>
  );
}
