import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createOutboxWriter } from "@nitap/database/outbox";
import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createTransactionRunner } from "@/infrastructure/database/transaction-runner";
import { createPrismaPostsStore } from "@/modules/posts/infrastructure/prisma-posts-store";

describe("posts store against real PostgreSQL", () => {
  let db: TestDatabase;
  let a: string;
  let b: string;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    [a, b] = await Promise.all([
      db.prisma.user
        .create({ data: { name: "one", email: "one@example.test" } })
        .then((u) => u.id),
      db.prisma.user
        .create({ data: { name: "two", email: "two@example.test" } })
        .then((u) => u.id),
    ]);
  });
  afterEach(async () => {
    await db.drop();
  });

  const store = () =>
    createPrismaPostsStore({
      runner: createTransactionRunner(db.prisma),
      outbox: createOutboxWriter(),
    });

  it("upsertReaction replaces the prior reaction rather than adding a second row", async () => {
    const s = store();
    const post = await s.transaction((tx) =>
      tx.insertPost({
        authorId: a,
        chapterId: null,
        content: "hi",
        imageUrls: [],
        linkUrl: null,
        postType: "TEXT",
      })
    );
    await s.transaction((tx) =>
      tx.upsertReaction({ postId: post.id, userId: b, type: "LIKE" })
    );
    await s.transaction((tx) =>
      tx.upsertReaction({ postId: post.id, userId: b, type: "CELEBRATE" })
    );
    const rows = await db.prisma.reaction.findMany({
      where: { postId: post.id, userId: b },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.type).toBe("CELEBRATE");
  });

  it("concurrent react calls from the same user still leave exactly one row (reaction uniqueness under concurrency)", async () => {
    const s = store();
    const post = await s.transaction((tx) =>
      tx.insertPost({
        authorId: a,
        chapterId: null,
        content: "hi",
        imageUrls: [],
        linkUrl: null,
        postType: "TEXT",
      })
    );
    await Promise.all([
      s.transaction((tx) =>
        tx.upsertReaction({ postId: post.id, userId: b, type: "LIKE" })
      ),
      s.transaction((tx) =>
        tx.upsertReaction({ postId: post.id, userId: b, type: "SUPPORT" })
      ),
    ]);
    expect(
      await db.prisma.reaction.count({ where: { postId: post.id, userId: b } })
    ).toBe(1);
  });

  it("soft-deleted posts are excluded from listFeed", async () => {
    const s = store();
    const post = await s.transaction((tx) =>
      tx.insertPost({
        authorId: a,
        chapterId: null,
        content: "hi",
        imageUrls: [],
        linkUrl: null,
        postType: "TEXT",
      })
    );
    await s.transaction((tx) => tx.softDeletePost(post.id));
    const feed = await s.transaction((tx) =>
      tx.listFeed({ limit: 10, after: null })
    );
    expect(feed.find((p) => p.id === post.id)).toBeUndefined();
  });

  it("listFeed sets openReportId only for posts with an OPEN/UNDER_REVIEW report, null otherwise", async () => {
    const s = store();
    const [reported, clean] = await s.transaction((tx) =>
      Promise.all([
        tx.insertPost({
          authorId: a,
          chapterId: null,
          content: "reported",
          imageUrls: [],
          linkUrl: null,
          postType: "TEXT",
        }),
        tx.insertPost({
          authorId: a,
          chapterId: null,
          content: "clean",
          imageUrls: [],
          linkUrl: null,
          postType: "TEXT",
        }),
      ])
    );
    const report = await db.prisma.report.create({
      data: {
        reporterId: b,
        targetType: "POST",
        targetId: reported.id,
        reason: "spam",
      },
    });
    const feed = await s.transaction((tx) =>
      tx.listFeed({ limit: 10, after: null })
    );
    expect(feed.find((p) => p.id === reported.id)?.openReportId).toBe(
      report.id
    );
    expect(feed.find((p) => p.id === clean.id)?.openReportId).toBeNull();
  });

  it("listFeed omits openReportId once the report is resolved/dismissed", async () => {
    const s = store();
    const post = await s.transaction((tx) =>
      tx.insertPost({
        authorId: a,
        chapterId: null,
        content: "hi",
        imageUrls: [],
        linkUrl: null,
        postType: "TEXT",
      })
    );
    await db.prisma.report.create({
      data: {
        reporterId: b,
        targetType: "POST",
        targetId: post.id,
        reason: "spam",
        status: "DISMISSED",
        resolvedById: b,
      },
    });
    const feed = await s.transaction((tx) =>
      tx.listFeed({ limit: 10, after: null })
    );
    expect(feed.find((p) => p.id === post.id)?.openReportId).toBeNull();
  });

  it("enqueue writes post.created to the outbox iff the transaction commits", async () => {
    const s = store();
    await expect(
      s.transaction(async (tx) => {
        const post = await tx.insertPost({
          authorId: a,
          chapterId: null,
          content: "hi",
          imageUrls: [],
          linkUrl: null,
          postType: "TEXT",
        });
        await tx.enqueue({
          type: "post.created",
          payload: { v: 1, postId: post.id, authorId: a },
        });
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    expect(await db.prisma.outboxEvent.count()).toBe(0);
    expect(await db.prisma.post.count()).toBe(0);
  });
});
