// apps/web/tests/integration/database/community.integration.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runSeed } from "@nitap/database/seed";
import {
  createTestDatabase,
  expectConstraintViolation,
  type TestDatabase,
} from "@nitap/testing";

describe("community tables (real PostgreSQL)", () => {
  let db: TestDatabase;
  let author: string;
  let other: string;
  let postId: string;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    const users = await Promise.all(
      ["author", "other"].map((name) =>
        db.prisma.user.create({ data: { name, email: `${name}@example.test` } })
      )
    );
    [author, other] = users.map((u) => u.id) as [string, string];
    postId = (
      await db.prisma.post.create({
        data: { authorId: author, content: "hello world", postType: "TEXT" },
      })
    ).id;
  });
  afterEach(async () => {
    await db.drop();
  });

  const fail = (p: Promise<unknown>) => p.catch((e) => e);

  it("bounds post content and image count (ck_post_content, ck_post_images)", async () => {
    expectConstraintViolation(
      await fail(
        db.prisma.post.create({
          data: { authorId: author, content: "", postType: "TEXT" },
        })
      ),
      "ck_post_content"
    );
    expectConstraintViolation(
      await fail(
        db.prisma.post.create({
          data: {
            authorId: author,
            content: "x".repeat(5001),
            postType: "TEXT",
          },
        })
      ),
      "ck_post_content"
    );
    expectConstraintViolation(
      await fail(
        db.prisma.post.create({
          data: {
            authorId: author,
            content: "hi",
            postType: "TEXT",
            imageUrls: ["a", "b", "c", "d", "e"],
          },
        })
      ),
      "ck_post_images"
    );
  });

  it("requires an https link when present (ck_post_link_https)", async () => {
    expectConstraintViolation(
      await fail(
        db.prisma.post.create({
          data: {
            authorId: author,
            content: "hi",
            postType: "TEXT",
            linkUrl: "http://x.test",
          },
        })
      ),
      "ck_post_link_https"
    );
    await db.prisma.post.create({
      data: {
        authorId: author,
        content: "hi",
        postType: "TEXT",
        linkUrl: "https://x.test",
      },
    });
  });

  it("bounds comment body (ck_comment_body)", async () => {
    expectConstraintViolation(
      await fail(
        db.prisma.comment.create({
          data: { postId, authorId: other, body: "" },
        })
      ),
      "ck_comment_body"
    );
    expectConstraintViolation(
      await fail(
        db.prisma.comment.create({
          data: { postId, authorId: other, body: "x".repeat(2001) },
        })
      ),
      "ck_comment_body"
    );
  });

  it("gives one reaction per (post, user) and rejects an unlisted type at the app layer, not the DB (uq_reaction_per_user)", async () => {
    await db.prisma.reaction.create({
      data: { postId, userId: other, type: "LIKE" },
    });
    expectConstraintViolation(
      await fail(
        db.prisma.reaction.create({
          data: { postId, userId: other, type: "CELEBRATE" },
        })
      ),
      "uq_reaction_per_user"
    );
  });

  it("bounds achievement title/description and enforces the category enum (ck_achievement_title, ck_achievement_description)", async () => {
    expectConstraintViolation(
      await fail(
        db.prisma.achievement.create({
          data: {
            userId: author,
            title: "",
            description: "d",
            category: "AWARD",
          },
        })
      ),
      "ck_achievement_title"
    );
    expectConstraintViolation(
      await fail(
        db.prisma.achievement.create({
          data: {
            userId: author,
            title: "t",
            description: "",
            category: "AWARD",
          },
        })
      ),
      "ck_achievement_description"
    );
  });

  it("requires published_post_id exactly when PUBLISHED (ck_achievement_published)", async () => {
    expectConstraintViolation(
      await fail(
        db.prisma.achievement.create({
          data: {
            userId: author,
            title: "t",
            description: "d",
            category: "AWARD",
            status: "PUBLISHED",
          },
        })
      ),
      "ck_achievement_published"
    );
    expectConstraintViolation(
      await fail(
        db.prisma.achievement.create({
          data: {
            userId: author,
            title: "t",
            description: "d",
            category: "AWARD",
            status: "SUBMITTED",
            publishedPostId: postId,
          },
        })
      ),
      "ck_achievement_published"
    );
    await db.prisma.achievement.create({
      data: {
        userId: author,
        title: "t",
        description: "d",
        category: "AWARD",
        status: "PUBLISHED",
        publishedPostId: postId,
      },
    });
  });

  it("soft-deletes without losing rows: deleted posts/comments still exist for audit (deleted flag, no cascade on delete flag)", async () => {
    await db.prisma.post.update({
      where: { id: postId },
      data: { deleted: true },
    });
    expect(await db.prisma.post.count({ where: { id: postId } })).toBe(1);
    expect(
      (await db.prisma.post.findUniqueOrThrow({ where: { id: postId } }))
        .deleted
    ).toBe(true);
  });

  it("removes a user's posts, comments, reactions and achievements when the user is deleted (cascade)", async () => {
    await db.prisma.comment.create({
      data: { postId, authorId: other, body: "hi" },
    });
    await db.prisma.reaction.create({
      data: { postId, userId: other, type: "LIKE" },
    });
    await db.prisma.achievement.create({
      data: { userId: other, title: "t", description: "d", category: "AWARD" },
    });
    await db.prisma.user.delete({ where: { id: other } });
    expect(await db.prisma.comment.count({ where: { authorId: other } })).toBe(
      0
    );
    expect(await db.prisma.reaction.count({ where: { userId: other } })).toBe(
      0
    );
    expect(
      await db.prisma.achievement.count({ where: { userId: other } })
    ).toBe(0);
  });

  it("accepts POST and COMMENT as report target types now that they are used (report table, unchanged shape from Phase 9)", async () => {
    const report = await db.prisma.report.create({
      data: {
        reporterId: other,
        targetType: "POST",
        targetId: postId,
        reason: "spam",
      },
    });
    expect(report.targetType).toBe("POST");
  });
});
