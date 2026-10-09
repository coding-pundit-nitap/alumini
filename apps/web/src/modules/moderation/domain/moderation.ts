import { z } from "zod";

/**
 * Pure rules. Claiming is optional before resolve/dismiss, and a reviewer may
 * never act on their own report or content.
 */
export type ReportState = "OPEN" | "UNDER_REVIEW" | "RESOLVED" | "DISMISSED";

export const REPORT_TARGET_TYPES = [
  "POST",
  "COMMENT",
  "MESSAGE",
  "USER",
] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];
/**
 * What `fileContentReport` accepts. Messages are filed by `messaging`; nothing
 * files USER reports yet.
 */
export type ModerationTarget = Extract<ReportTargetType, "POST" | "COMMENT">;

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

export function isSelf(
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

/** Codes, never free text: they go into audit metadata. */
export const RESOLVE_REASONS = [
  "SPAM",
  "HARASSMENT",
  "HATE",
  "MISINFORMATION",
  "PRIVACY",
  "OTHER",
] as const;
export const DISMISS_REASONS = [
  "NO_VIOLATION",
  "DUPLICATE",
  "INSUFFICIENT_CONTEXT",
] as const;
export type ResolveReason = (typeof RESOLVE_REASONS)[number];
export type DismissReason = (typeof DISMISS_REASONS)[number];
export const resolveInput = z
  .object({ reason: z.enum(RESOLVE_REASONS) })
  .strict();
export const dismissInput = z
  .object({ reason: z.enum(DISMISS_REASONS) })
  .strict();

/** A GET form sends empty strings for untouched fields; they mean "absent". */
const dropEmpty = (input: unknown) =>
  input && typeof input === "object" && !Array.isArray(input)
    ? Object.fromEntries(Object.entries(input).filter(([, v]) => v !== ""))
    : input;

export const REPORT_STATUS_FILTERS = ["open", "RESOLVED", "DISMISSED"] as const;
export type ReportStatusFilter = (typeof REPORT_STATUS_FILTERS)[number];

/**
 * Filters for the reports queue. Shared by `GET /api/v1/reports` and
 * `/admin/reports`.
 */
export const reportListQuerySchema = z.preprocess(
  dropEmpty,
  z
    .object({
      status: z.enum(REPORT_STATUS_FILTERS).default("open"),
      targetType: z.enum(REPORT_TARGET_TYPES).optional(),
      cursor: z.string().max(200).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    })
    .strict()
);
export type ReportListQuery = z.infer<typeof reportListQuerySchema>;

export const statusesFor = (filter: ReportStatusFilter): ReportState[] =>
  filter === "open" ? ["OPEN", "UNDER_REVIEW"] : [filter];
