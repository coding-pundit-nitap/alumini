import { z } from "zod";

/**
 * The report review/resolution rules, pure (FR-MOD-001…004, spec C-8). Extends Phase 9's filing-only shape:
 * `claimReport` is optional UI sugar (not enforced before resolve/dismiss); `report.review` may never act on
 * the actor's own filing or their own content (RBAC matrix §8 guardrail 3).
 */
export type ReportState = "OPEN" | "UNDER_REVIEW" | "RESOLVED" | "DISMISSED";
export type ModerationTarget = "POST" | "COMMENT";

export const reportContentInput = z
  .object({
    targetType: z.enum(["POST", "COMMENT"]),
    targetId: z.string().min(1),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();

export type Refusal = {
  code: "INVALID_STATE_TRANSITION" | "SELF_REVIEW_FORBIDDEN";
};
type Decision<T = object> = ({ ok: true } & T) | ({ ok: false } & Refusal);
const refuse = (code: Refusal["code"]): { ok: false } & Refusal => ({
  ok: false,
  code,
});

function isSelf(
  actorId: string,
  reporterId: string,
  contentAuthorId: string
): boolean {
  return actorId === reporterId || actorId === contentAuthorId;
}

export function decideClaim(
  status: ReportState,
  actorId: string,
  reporterId: string,
  contentAuthorId: string
): Decision {
  if (isSelf(actorId, reporterId, contentAuthorId))
    return refuse("SELF_REVIEW_FORBIDDEN");
  if (status !== "OPEN") return refuse("INVALID_STATE_TRANSITION");
  return { ok: true };
}

export function decideResolve(
  status: ReportState,
  actorId: string,
  reporterId: string,
  contentAuthorId: string,
  outcome: "resolve" | "dismiss"
): Decision<{ to: ReportState }> {
  if (isSelf(actorId, reporterId, contentAuthorId))
    return refuse("SELF_REVIEW_FORBIDDEN");
  if (status !== "OPEN" && status !== "UNDER_REVIEW")
    return refuse("INVALID_STATE_TRANSITION");
  return { ok: true, to: outcome === "resolve" ? "RESOLVED" : "DISMISSED" };
}
