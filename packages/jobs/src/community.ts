import { z } from "zod";

import { defineJob, FANOUT_TIMEOUT_MS } from "./define-job.ts";

const base = { v: z.literal(1) };

const postCreatedPayload = z
  .object({ ...base, postId: z.uuid(), authorId: z.uuid() })
  .strict();
export type PostCreatedPayload = z.infer<typeof postCreatedPayload>;

const commentCreatedPayload = z
  .object({
    ...base,
    commentId: z.uuid(),
    postId: z.uuid(),
    authorId: z.uuid(),
  })
  .strict();
export type CommentCreatedPayload = z.infer<typeof commentCreatedPayload>;

const reactionAddedPayload = z
  .object({
    ...base,
    postId: z.uuid(),
    userId: z.uuid(),
    type: z.string().min(1).max(32),
  })
  .strict();
export type ReactionAddedPayload = z.infer<typeof reactionAddedPayload>;

const achievementSubmittedPayload = z
  .object({ ...base, achievementId: z.uuid(), userId: z.uuid() })
  .strict();
export type AchievementSubmittedPayload = z.infer<
  typeof achievementSubmittedPayload
>;

const achievementApprovedPayload = z
  .object({
    ...base,
    achievementId: z.uuid(),
    userId: z.uuid(),
    postId: z.uuid(),
  })
  .strict();
export type AchievementApprovedPayload = z.infer<
  typeof achievementApprovedPayload
>;

const achievementRejectedPayload = z
  .object({ ...base, achievementId: z.uuid(), userId: z.uuid() })
  .strict();
export type AchievementRejectedPayload = z.infer<
  typeof achievementRejectedPayload
>;

const reportFiledPayload = z
  .object({
    ...base,
    reportId: z.uuid(),
    targetType: z.enum(["POST", "COMMENT"]),
    targetId: z.uuid(),
    reporterId: z.uuid(),
  })
  .strict();
export type ReportFiledPayload = z.infer<typeof reportFiledPayload>;

const reportResolvedPayload = z
  .object({
    ...base,
    reportId: z.uuid(),
    outcome: z.enum(["resolved", "dismissed"]),
  })
  .strict();
export type ReportResolvedPayload = z.infer<typeof reportResolvedPayload>;

const contentRemovedPayload = z
  .object({
    ...base,
    targetType: z.enum(["POST", "COMMENT"]),
    targetId: z.uuid(),
    reportId: z.uuid(),
  })
  .strict();
export type ContentRemovedPayload = z.infer<typeof contentRemovedPayload>;

const retry = {
  attempts: 8,
  baseDelayMs: 1_000,
  maxDelayMs: 60_000,
  jitter: 0.2,
};
const idempotency =
  "Ids-only; replaying the same event re-derives the same downstream effect (a notification fan-out), never a second write to community tables.";

export const postCreated = defineJob({
  name: "post.created",
  version: 1,
  queue: "default",
  schema: postCreatedPayload,
  retry,
  timeoutMs: 10_000,
  idempotency,
});

export const commentCreated = defineJob({
  name: "comment.created",
  version: 1,
  queue: "default",
  schema: commentCreatedPayload,
  retry,
  timeoutMs: 10_000,
  idempotency,
});

export const reactionAdded = defineJob({
  name: "reaction.added",
  version: 1,
  queue: "default",
  schema: reactionAddedPayload,
  retry,
  timeoutMs: 10_000,
  idempotency,
});

export const achievementSubmitted = defineJob({
  name: "achievement.submitted",
  version: 1,
  queue: "default",
  schema: achievementSubmittedPayload,
  retry,
  timeoutMs: FANOUT_TIMEOUT_MS,
  idempotency,
});

export const achievementApproved = defineJob({
  name: "achievement.approved",
  version: 1,
  queue: "default",
  schema: achievementApprovedPayload,
  retry,
  timeoutMs: 10_000,
  idempotency,
});

export const achievementRejected = defineJob({
  name: "achievement.rejected",
  version: 1,
  queue: "default",
  schema: achievementRejectedPayload,
  retry,
  timeoutMs: 10_000,
  idempotency,
});

export const reportFiled = defineJob({
  name: "report.filed",
  version: 1,
  queue: "default",
  schema: reportFiledPayload,
  retry,
  timeoutMs: FANOUT_TIMEOUT_MS,
  idempotency,
});

export const reportResolved = defineJob({
  name: "report.resolved",
  version: 1,
  queue: "default",
  schema: reportResolvedPayload,
  retry,
  timeoutMs: 10_000,
  idempotency,
});

export const contentRemoved = defineJob({
  name: "content.removed",
  version: 1,
  queue: "default",
  schema: contentRemovedPayload,
  retry,
  timeoutMs: 10_000,
  idempotency,
});
