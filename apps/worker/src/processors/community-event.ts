import type {
  AchievementApprovedPayload,
  AchievementRejectedPayload,
  AchievementSubmittedPayload,
  CommentCreatedPayload,
  ContentRemovedPayload,
  PostCreatedPayload,
  ReactionAddedPayload,
  ReportFiledPayload,
  ReportResolvedPayload,
} from "@nitap/jobs";
import type { JobProcessor } from "@nitap/queue";

import type { DeliverNotification } from "../notifications/deliver.ts";

type Deps = {
  deliver: DeliverNotification;
  /** Re-reads the current email; null skips email (account may be deactivated). */
  findEmail: (userId: string) => Promise<string | null>;
};

/**
 * Handles the nine Community outbox events. post.created and reaction.added deliberately notify no
 * one (spec catalogue). Every notifying processor re-reads current state at delivery time and returns
 * quietly if the row is gone (never throws into an endless retry). Ids only in logs and payloads.
 */
export function createPostCreatedProcessor(): JobProcessor<PostCreatedPayload> {
  return async (payload, { logger }) => {
    logger.info("post.created.handled", {
      metadata: { postId: payload.postId, authorId: payload.authorId },
    });
  };
}

export function createCommentCreatedProcessor(
  deps: Deps & {
    /** null when the post is gone or soft-deleted. */
    findPostAuthor: (postId: string) => Promise<string | null>;
    /** Distinct authors of live comments on the post, excluding `excludeUserId`; the caller caps the size. */
    findPriorCommenters: (
      postId: string,
      excludeUserId: string
    ) => Promise<string[]>;
    /** False when the comment is deleted or gone. */
    commentIsLive: (commentId: string) => Promise<boolean>;
    /** Symmetric, checked at delivery time. */
    blocked: (a: string, b: string) => Promise<boolean>;
  }
): JobProcessor<CommentCreatedPayload> {
  return async (payload, { logger, signal, jobId: eventId }) => {
    logger.info("comment.created.handled", {
      metadata: {
        commentId: payload.commentId,
        postId: payload.postId,
        authorId: payload.authorId,
      },
    });
    const author = await deps.findPostAuthor(payload.postId);
    if (!author || !(await deps.commentIsLive(payload.commentId))) return;
    const prior = await deps.findPriorCommenters(
      payload.postId,
      payload.authorId
    );
    const recipients = new Set([author, ...prior]);
    recipients.delete(payload.authorId);
    // ponytail: sequential (≤201 recipients); a midway failure or timeout retries safely (deliver dedupes per recipient).
    for (const recipientId of recipients) {
      signal.throwIfAborted();
      if (await deps.blocked(payload.authorId, recipientId)) continue;
      await deps.deliver({
        eventId,
        type: "comment.created",
        category: "ENGAGEMENT",
        recipientId,
        payload: { postId: payload.postId, commentId: payload.commentId },
        emailTo: (await deps.findEmail(recipientId)) ?? undefined,
      });
    }
  };
}

/** Deliberately no notification: high-frequency, low-signal (spec catalogue, reaction.added row). */
export function createReactionAddedProcessor(): JobProcessor<ReactionAddedPayload> {
  return async (payload, { logger }) => {
    logger.info("reaction.added.handled", {
      metadata: { postId: payload.postId, userId: payload.userId },
    });
  };
}

type AchievementDeps = Deps & {
  achievementExists: (achievementId: string) => Promise<boolean>;
};

export function createAchievementSubmittedProcessor(
  deps: AchievementDeps & {
    findModerators: (permission: "achievement.review") => Promise<string[]>;
  }
): JobProcessor<AchievementSubmittedPayload> {
  return async (payload, { logger, signal, jobId: eventId }) => {
    logger.info("achievement.submitted.handled", {
      metadata: {
        achievementId: payload.achievementId,
        userId: payload.userId,
      },
    });
    if (!(await deps.achievementExists(payload.achievementId))) return;
    for (const recipientId of await deps.findModerators("achievement.review")) {
      signal.throwIfAborted(); // timed out: stop, the retry resumes (deliver dedupes)
      if (recipientId === payload.userId) continue;
      await deps.deliver({
        eventId,
        type: "achievement.submitted",
        category: "ENGAGEMENT",
        recipientId,
        payload: { achievementId: payload.achievementId },
      });
    }
  };
}

function submitterOutcome(
  action: "approved" | "rejected"
): (
  deps: AchievementDeps
) => JobProcessor<AchievementApprovedPayload | AchievementRejectedPayload> {
  return (deps) =>
    async (payload, { logger, jobId: eventId }) => {
      logger.info(`achievement.${action}.handled`, {
        metadata: {
          achievementId: payload.achievementId,
          userId: payload.userId,
        },
      });
      if (!(await deps.achievementExists(payload.achievementId))) return;
      await deps.deliver({
        eventId,
        type: `achievement.${action}`,
        category: "ENGAGEMENT",
        recipientId: payload.userId,
        payload: { achievementId: payload.achievementId },
        emailTo: (await deps.findEmail(payload.userId)) ?? undefined,
      });
    };
}

export const createAchievementApprovedProcessor = submitterOutcome(
  "approved"
) as (deps: AchievementDeps) => JobProcessor<AchievementApprovedPayload>;
export const createAchievementRejectedProcessor = submitterOutcome(
  "rejected"
) as (deps: AchievementDeps) => JobProcessor<AchievementRejectedPayload>;

export function createReportFiledProcessor(
  deps: Deps & {
    findModerators: (permission: "report.review") => Promise<string[]>;
    reportExists: (reportId: string) => Promise<boolean>;
  }
): JobProcessor<ReportFiledPayload> {
  return async (payload, { logger, signal, jobId: eventId }) => {
    logger.info("report.filed.handled", {
      metadata: { reportId: payload.reportId, reporterId: payload.reporterId },
    });
    if (!(await deps.reportExists(payload.reportId))) return;
    for (const recipientId of await deps.findModerators("report.review")) {
      signal.throwIfAborted(); // timed out: stop, the retry resumes (deliver dedupes)
      if (recipientId === payload.reporterId) continue;
      await deps.deliver({
        eventId,
        type: "report.filed",
        category: "ENGAGEMENT",
        recipientId,
        payload: { reportId: payload.reportId },
      });
    }
  };
}

export function createReportResolvedProcessor(
  deps: Deps & {
    /** null when the report is gone. */
    findReporter: (reportId: string) => Promise<string | null>;
  }
): JobProcessor<ReportResolvedPayload> {
  return async (payload, { logger, jobId: eventId }) => {
    logger.info("report.resolved.handled", {
      metadata: { reportId: payload.reportId, outcome: payload.outcome },
    });
    const reporterId = await deps.findReporter(payload.reportId);
    if (!reporterId) return;
    await deps.deliver({
      eventId,
      type: "report.resolved",
      category: "ENGAGEMENT",
      recipientId: reporterId,
      payload: { reportId: payload.reportId },
    });
  };
}

export function createContentRemovedProcessor(
  deps: Deps & {
    /** Author of the (soft-deleted) post/comment; null only when the row is truly gone. Must not filter on `deleted`. */
    findContentAuthor: (
      targetType: "POST" | "COMMENT",
      targetId: string
    ) => Promise<string | null>;
  }
): JobProcessor<ContentRemovedPayload> {
  return async (payload, { logger, jobId: eventId }) => {
    logger.info("content.removed.handled", {
      metadata: { targetType: payload.targetType, targetId: payload.targetId },
    });
    const authorId = await deps.findContentAuthor(
      payload.targetType,
      payload.targetId
    );
    if (!authorId) return;
    await deps.deliver({
      eventId,
      type: "content.removed",
      category: "ENGAGEMENT",
      recipientId: authorId,
      payload: { targetType: payload.targetType, targetId: payload.targetId },
      emailTo: (await deps.findEmail(authorId)) ?? undefined,
    });
  };
}
