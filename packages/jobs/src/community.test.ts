import { describe, expect, it } from "vitest";

import {
  achievementApproved,
  achievementRejected,
  achievementSubmitted,
  commentCreated,
  contentRemoved,
  postCreated,
  reactionAdded,
  reportFiled,
  reportResolved,
} from "./community.ts";
import { OUTBOX_EVENTS, isOutboxEventType } from "./registry.ts";

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;

describe("community outbox events", () => {
  it("accept ids-only payloads and reject extra fields", () => {
    expect(
      postCreated.schema.safeParse({ v: 1, postId: uuid(1), authorId: uuid(2) })
        .success
    ).toBe(true);
    expect(
      postCreated.schema.safeParse({
        v: 1,
        postId: uuid(1),
        authorId: uuid(2),
        content: "x",
      }).success
    ).toBe(false);
    expect(
      commentCreated.schema.safeParse({
        v: 1,
        commentId: uuid(1),
        postId: uuid(2),
        authorId: uuid(3),
      }).success
    ).toBe(true);
    expect(
      reactionAdded.schema.safeParse({
        v: 1,
        postId: uuid(1),
        userId: uuid(2),
        type: "LIKE",
      }).success
    ).toBe(true);
    expect(
      achievementSubmitted.schema.safeParse({
        v: 1,
        achievementId: uuid(1),
        userId: uuid(2),
      }).success
    ).toBe(true);
    expect(
      achievementApproved.schema.safeParse({
        v: 1,
        achievementId: uuid(1),
        userId: uuid(2),
        postId: uuid(3),
      }).success
    ).toBe(true);
    expect(
      achievementRejected.schema.safeParse({
        v: 1,
        achievementId: uuid(1),
        userId: uuid(2),
      }).success
    ).toBe(true);
    expect(
      reportFiled.schema.safeParse({
        v: 1,
        reportId: uuid(1),
        targetType: "POST",
        targetId: uuid(2),
        reporterId: uuid(3),
      }).success
    ).toBe(true);
    expect(
      reportFiled.schema.safeParse({
        v: 1,
        reportId: uuid(1),
        targetType: "MESSAGE",
        targetId: uuid(2),
        reporterId: uuid(3),
      }).success
    ).toBe(false);
    expect(
      reportResolved.schema.safeParse({
        v: 1,
        reportId: uuid(1),
        outcome: "resolved",
      }).success
    ).toBe(true);
    expect(
      contentRemoved.schema.safeParse({
        v: 1,
        targetType: "COMMENT",
        targetId: uuid(1),
        reportId: uuid(2),
      }).success
    ).toBe(true);
  });

  it("are registered as outbox events", () => {
    for (const [type, job] of [
      ["post.created", postCreated],
      ["comment.created", commentCreated],
      ["reaction.added", reactionAdded],
      ["achievement.submitted", achievementSubmitted],
      ["achievement.approved", achievementApproved],
      ["achievement.rejected", achievementRejected],
      ["report.filed", reportFiled],
      ["report.resolved", reportResolved],
      ["content.removed", contentRemoved],
    ] as const) {
      expect(isOutboxEventType(type)).toBe(true);
      expect(OUTBOX_EVENTS[type]).toBe(job);
    }
  });
});
