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
import { Award } from "lucide-react";
import { useState, useTransition } from "react";

import type { ActionResult } from "@/lib/action-result";
import { relativeTime } from "@/lib/relative-time";

import type { AchievementRow } from "../../application/achievements-store";

type ReviewAction = (
  achievementId: string,
  outcome: "approve" | "reject"
) => Promise<ActionResult<Record<string, never>>>;

type Achievement = AchievementRow & { owner?: { id: string; name: string } };

const STATUS_VARIANT: Record<
  AchievementRow["status"],
  "default" | "secondary" | "success" | "destructive"
> = {
  SUBMITTED: "secondary",
  UNDER_REVIEW: "secondary",
  APPROVED: "default",
  PUBLISHED: "success",
  REJECTED: "destructive",
  WITHDRAWN: "destructive",
};

const CONFIRM_COPY = {
  approve: {
    title: "Approve this achievement?",
    description: "It is published to the feed as an achievement post.",
    action: "Approve achievement",
  },
  reject: {
    title: "Reject this achievement?",
    description: "The member is told it was not approved.",
    action: "Reject achievement",
  },
} as const;

function CardBody({ achievement }: { achievement: Achievement }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Badge variant="outline">{achievement.category}</Badge>
        <p className="font-medium">{achievement.title}</p>
        <Badge variant={STATUS_VARIANT[achievement.status]}>
          {achievement.status}
        </Badge>
      </div>
      <p className="text-muted-foreground text-sm">{achievement.description}</p>
      <p className="text-muted-foreground text-sm">
        {achievement.owner ? `By ${achievement.owner.name} · ` : ""}
        {relativeTime(achievement.createdAt)}
      </p>
    </div>
  );
}

function Row({
  achievement,
  onReview,
}: {
  achievement: Achievement;
  onReview: ReviewAction;
}) {
  const [confirming, setConfirming] = useState<"approve" | "reject" | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function decide(outcome: "approve" | "reject") {
    setConfirming(null);
    startTransition(async () => {
      const result = await onReview(achievement.id, outcome);
      if (!result.ok) setError(result.error.message);
    });
  }

  const copy = confirming ? CONFIRM_COPY[confirming] : null;

  return (
    <li className="bg-card rounded-xl border p-5">
      <CardBody achievement={achievement} />
      <div className="mt-3 flex gap-2">
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
      </div>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <AlertDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy?.title}</AlertDialogTitle>
            <AlertDialogDescription>{copy?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={confirming === "reject" ? "destructive" : "brand"}
              onClick={() => confirming && decide(confirming)}
            >
              {copy?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

/**
 * A list of achievements (own submissions, or — where a reviewer sees someone else's — the reviewer's
 * inline approve/reject affordance, C-7; there is no dedicated reviewer queue page this phase).
 */
export function AchievementList({
  achievements,
  isReviewer,
  onReview,
}: {
  achievements: Achievement[];
  isReviewer: boolean;
  onReview?: ReviewAction;
}) {
  if (achievements.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
        <div className="bg-muted flex size-12 items-center justify-center rounded-full">
          <Award aria-hidden className="text-muted-foreground size-5" />
        </div>
        <p className="text-muted-foreground text-sm">No achievements yet.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {achievements.map((achievement) =>
        isReviewer && onReview ? (
          <Row
            key={achievement.id}
            achievement={achievement}
            onReview={onReview}
          />
        ) : (
          <li key={achievement.id} className="bg-card rounded-xl border p-5">
            <CardBody achievement={achievement} />
          </li>
        )
      )}
    </ul>
  );
}
