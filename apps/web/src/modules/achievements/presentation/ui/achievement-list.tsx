"use client";

import { Badge } from "@nitap/ui/components/badge";
import { Button } from "@nitap/ui/components/button";
import { Card, CardContent, CardFooter } from "@nitap/ui/components/card";

import type { ActionResult } from "@/lib/action-result";

import type { AchievementRow } from "../../application/achievements-store";

type ReviewAction = (
  achievementId: string,
  outcome: "approve" | "reject"
) => Promise<ActionResult<Record<string, never>>>;

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

/**
 * A list of achievements (own submissions, or — where a reviewer sees someone else's — the reviewer's
 * inline approve/reject affordance, C-7; there is no dedicated reviewer queue page this phase).
 */
export function AchievementList({
  achievements,
  isReviewer,
  onReview,
}: {
  achievements: AchievementRow[];
  isReviewer: boolean;
  onReview?: ReviewAction;
}) {
  if (achievements.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No achievements yet.</p>
    );
  }

  return (
    <ul className="space-y-3">
      {achievements.map((achievement) => (
        <li key={achievement.id}>
          <Card>
            <CardContent className="space-y-1.5">
              <div className="flex items-center gap-2">
                <p className="font-medium">{achievement.title}</p>
                <Badge variant={STATUS_VARIANT[achievement.status]}>
                  {achievement.status}
                </Badge>
              </div>
              <p className="text-muted-foreground text-sm">
                {achievement.description}
              </p>
            </CardContent>
            {isReviewer && onReview ? (
              <CardFooter className="gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onReview(achievement.id, "approve")}
                >
                  Approve
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => onReview(achievement.id, "reject")}
                >
                  Reject
                </Button>
              </CardFooter>
            ) : null}
          </Card>
        </li>
      ))}
    </ul>
  );
}
