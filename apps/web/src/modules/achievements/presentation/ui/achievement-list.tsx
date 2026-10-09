"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@nitap/ui/components/alert-dialog";
import { Badge } from "@nitap/ui/components/badge";
import { Button } from "@nitap/ui/components/button";
import { cn } from "@nitap/ui/lib/utils";
import { ArrowUpRight, Award } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import type { ActionResult } from "@/lib/action-result";
import { relativeTime } from "@/lib/relative-time";

import type { AchievementRow } from "../../application/achievements-store";
import { categoryMeta, STATUS } from "../labels";

type ReviewAction = (
  achievementId: string,
  outcome: "approve" | "reject"
) => Promise<ActionResult<Record<string, never>>>;
type WithdrawAction = (
  achievementId: string
) => Promise<ActionResult<Record<string, never>>>;

type Achievement = AchievementRow & { owner?: { id: string; name: string } };
type Decision = "approve" | "reject" | "withdraw";

const CONFIRM_COPY = {
  approve: {
    title: "Approve this achievement?",
    description: "It is published to the feed as an achievement post.",
    cancel: "Cancel",
    action: "Approve achievement",
  },
  reject: {
    title: "Reject this achievement?",
    description: "The member is told it was not approved.",
    cancel: "Cancel",
    action: "Reject achievement",
  },
  withdraw: {
    title: "Withdraw this achievement?",
    description:
      "It leaves the review queue and won't be posted. You can submit it again later.",
    cancel: "Keep it",
    action: "Withdraw",
  },
} as const;

function Body({ achievement }: { achievement: Achievement }) {
  const category = categoryMeta(achievement.category);
  const status = STATUS[achievement.status];
  const Icon = category.icon;
  return (
    <div className="flex gap-3">
      <span
        aria-hidden
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-xl",
          category.tone
        )}
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 leading-tight">
            <p className="font-medium">{achievement.title}</p>
            <p className="text-muted-foreground text-xs">
              {achievement.owner ? `By ${achievement.owner.name} · ` : ""}
              {category.label} ·{" "}
              <span suppressHydrationWarning>
                {relativeTime(achievement.createdAt)}
              </span>
            </p>
          </div>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
        <p className="text-muted-foreground line-clamp-3 text-sm whitespace-pre-line">
          {achievement.description}
        </p>
        {achievement.status === "PUBLISHED" && achievement.publishedPostId ? (
          <Link
            href={`/feed/${achievement.publishedPostId}`}
            className="text-brand inline-flex items-center gap-0.5 text-xs font-medium underline-offset-2 hover:underline"
          >
            View post
            <ArrowUpRight aria-hidden className="size-3.5" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function Row({
  achievement,
  onReview,
  onWithdraw,
}: {
  achievement: Achievement;
  onReview?: ReviewAction;
  onWithdraw?: WithdrawAction;
}) {
  const [confirming, setConfirming] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function decide(decision: Decision) {
    setConfirming(null);
    setError(null);
    startTransition(async () => {
      const result =
        decision === "withdraw"
          ? await onWithdraw!(achievement.id)
          : await onReview!(achievement.id, decision);
      if (!result.ok) setError(result.error.message);
    });
  }

  const canWithdraw = !!onWithdraw && achievement.status === "SUBMITTED";
  const copy = confirming ? CONFIRM_COPY[confirming] : null;

  return (
    <li className="px-4 py-4 sm:px-5">
      <Body achievement={achievement} />
      {onReview || canWithdraw ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 pl-14">
          {onReview ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="brand"
                className="rounded-full"
                disabled={pending}
                onClick={() => setConfirming("approve")}
              >
                Approve
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="text-destructive rounded-full"
                disabled={pending}
                onClick={() => setConfirming("reject")}
              >
                Reject
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-muted-foreground rounded-full"
              disabled={pending}
              onClick={() => setConfirming("withdraw")}
            >
              Withdraw
            </Button>
          )}
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
      {onReview || canWithdraw ? (
        <AlertDialog
          open={confirming !== null}
          onOpenChange={(open) => !open && setConfirming(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{copy?.title}</AlertDialogTitle>
              <AlertDialogDescription>
                {copy?.description}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{copy?.cancel}</AlertDialogCancel>
              <AlertDialogAction
                variant={confirming === "approve" ? "brand" : "destructive"}
                onClick={() => confirming && decide(confirming)}
              >
                {copy?.action}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </li>
  );
}

/**
 * The caller's own achievements, or a reviewer's queue. Reviewers never see
 * their own here.
 */
export function AchievementList({
  achievements,
  isReviewer,
  onReview,
  onWithdraw,
  olderHref = null,
  emptyText = "No achievements yet.",
}: {
  achievements: Achievement[];
  isReviewer: boolean;
  onReview?: ReviewAction;
  onWithdraw?: WithdrawAction;
  /** Link to the next page, by cursor. */
  olderHref?: string | null;
  emptyText?: string;
}) {
  if (achievements.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
        <div className="bg-muted flex size-12 items-center justify-center rounded-full">
          <Award aria-hidden className="text-muted-foreground size-5" />
        </div>
        <p className="text-muted-foreground text-sm">{emptyText}</p>
      </div>
    );
  }

  return (
    <div>
      <ul className="divide-border divide-y">
        {achievements.map((achievement) => (
          <Row
            key={achievement.id}
            achievement={achievement}
            onReview={isReviewer ? onReview : undefined}
            onWithdraw={isReviewer ? undefined : onWithdraw}
          />
        ))}
      </ul>
      {olderHref ? (
        <div className="flex justify-center border-t py-4">
          <Link
            href={olderHref}
            className="text-muted-foreground hover:text-foreground rounded-full px-3 py-1.5 text-sm transition-colors"
          >
            Older achievements
          </Link>
        </div>
      ) : null}
    </div>
  );
}
