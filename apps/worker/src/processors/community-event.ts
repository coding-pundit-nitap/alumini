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

/**
 * Acknowledges the nine Community outbox events (post/comment/reaction/achievement/report/content).
 * Notification fan-out lands in Phase 11 (TASK.md); this processor only needs to exist so the worker's
 * exhaustiveness check passes and the event is durably queued. Ids only: nothing personal is logged.
 */
export function createPostCreatedProcessor(): JobProcessor<PostCreatedPayload> {
  return async (payload, { logger }) => {
    logger.info("post.created.handled", {
      metadata: { postId: payload.postId, authorId: payload.authorId },
    });
  };
}

export function createCommentCreatedProcessor(): JobProcessor<CommentCreatedPayload> {
  return async (payload, { logger }) => {
    logger.info("comment.created.handled", {
      metadata: {
        commentId: payload.commentId,
        postId: payload.postId,
        authorId: payload.authorId,
      },
    });
  };
}

export function createReactionAddedProcessor(): JobProcessor<ReactionAddedPayload> {
  return async (payload, { logger }) => {
    logger.info("reaction.added.handled", {
      metadata: { postId: payload.postId, userId: payload.userId },
    });
  };
}

export function createAchievementSubmittedProcessor(): JobProcessor<AchievementSubmittedPayload> {
  return async (payload, { logger }) => {
    logger.info("achievement.submitted.handled", {
      metadata: {
        achievementId: payload.achievementId,
        userId: payload.userId,
      },
    });
  };
}

export function createAchievementApprovedProcessor(): JobProcessor<AchievementApprovedPayload> {
  return async (payload, { logger }) => {
    logger.info("achievement.approved.handled", {
      metadata: {
        achievementId: payload.achievementId,
        userId: payload.userId,
        postId: payload.postId,
      },
    });
  };
}

export function createAchievementRejectedProcessor(): JobProcessor<AchievementRejectedPayload> {
  return async (payload, { logger }) => {
    logger.info("achievement.rejected.handled", {
      metadata: {
        achievementId: payload.achievementId,
        userId: payload.userId,
      },
    });
  };
}

export function createReportFiledProcessor(): JobProcessor<ReportFiledPayload> {
  return async (payload, { logger }) => {
    logger.info("report.filed.handled", {
      metadata: { reportId: payload.reportId, reporterId: payload.reporterId },
    });
  };
}

export function createReportResolvedProcessor(): JobProcessor<ReportResolvedPayload> {
  return async (payload, { logger }) => {
    logger.info("report.resolved.handled", {
      metadata: { reportId: payload.reportId, outcome: payload.outcome },
    });
  };
}

export function createContentRemovedProcessor(): JobProcessor<ContentRemovedPayload> {
  return async (payload, { logger }) => {
    logger.info("content.removed.handled", {
      metadata: { targetType: payload.targetType, targetId: payload.targetId },
    });
  };
}
