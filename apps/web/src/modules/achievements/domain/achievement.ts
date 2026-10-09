import { z } from "zod";

export const ACHIEVEMENT_STATES = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "PUBLISHED",
  "REJECTED",
  "WITHDRAWN",
] as const;
export type AchievementState = (typeof ACHIEVEMENT_STATES)[number];

/** Submission input, the single source of the pure validation rule. */
export const achievementInput = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(5000),
    category: z.enum([
      "AWARD",
      "PUBLICATION",
      "PROMOTION",
      "CERTIFICATION",
      "ENTREPRENEURSHIP",
      "OTHER",
    ]),
  })
  .strict();

export type AchievementAction = "review" | "withdraw";
export type AchievementEventType =
  "achievement.approved" | "achievement.rejected" | "achievement.withdrawn";

export type AchievementRow = {
  id: string;
  userId: string;
  status: AchievementState;
};
export type AchievementPatch = Pick<AchievementRow, "status">;

export type Refusal = {
  code:
    | "NOT_OWNER"
    | "NOT_REVIEWER"
    | "SELF_REVIEW_FORBIDDEN"
    | "INVALID_STATE_TRANSITION";
};
type Decision<T> = ({ ok: true } & T) | ({ ok: false } & Refusal);
const refuse = (code: Refusal["code"]): { ok: false } & Refusal => ({
  ok: false,
  code,
});

const REVIEWABLE_FROM: readonly AchievementState[] = [
  "SUBMITTED",
  "UNDER_REVIEW",
];

/**
 * The caller has already checked `achievement.review`; this enforces no self-review, SUBMITTED-only
 * withdrawal and the transition table.
 */
export function decideTransition(
  row: AchievementRow,
  actorId: string,
  input: { action: AchievementAction; outcome?: "approve" | "reject" },
  isReviewer: boolean
): Decision<{
  patch: AchievementPatch;
  event: AchievementEventType;
  to: AchievementState;
}> {
  if (input.action === "withdraw") {
    if (row.userId !== actorId) return refuse("NOT_OWNER");
    if (row.status !== "SUBMITTED") return refuse("INVALID_STATE_TRANSITION");
    return {
      ok: true,
      to: "WITHDRAWN",
      event: "achievement.withdrawn",
      patch: { status: "WITHDRAWN" },
    };
  }

  // action === "review"
  if (row.userId === actorId) return refuse("SELF_REVIEW_FORBIDDEN");
  if (!isReviewer) return refuse("NOT_REVIEWER");
  if (!REVIEWABLE_FROM.includes(row.status))
    return refuse("INVALID_STATE_TRANSITION");

  if (input.outcome === "approve") {
    return {
      ok: true,
      to: "PUBLISHED",
      event: "achievement.approved",
      patch: { status: "PUBLISHED" },
    };
  }
  return {
    ok: true,
    to: "REJECTED",
    event: "achievement.rejected",
    patch: { status: "REJECTED" },
  };
}
