import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAuditWriter } from "@nitap/database/audit";
import { createOutboxWriter } from "@nitap/database/outbox";
import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createTransactionRunner } from "@/infrastructure/database/transaction-runner";
import { createPrismaAchievementsStore } from "@/modules/achievements/infrastructure/prisma-achievements-store";

describe("achievements store against real PostgreSQL", () => {
  let db: TestDatabase;
  let user: string;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    user = (
      await db.prisma.user.create({
        data: { name: "u", email: "u@example.test" },
      })
    ).id;
  });
  afterEach(async () => {
    await db.drop();
  });

  const store = () =>
    createPrismaAchievementsStore({
      runner: createTransactionRunner(db.prisma),
      outbox: createOutboxWriter(),
      audit: createAuditWriter(),
    });

  it("publishAsPost + patchAchievement in one transaction: a mid-transaction failure leaves neither row", async () => {
    const s = store();
    const a = await s.transaction((tx) =>
      tx.insertAchievement({
        userId: user,
        title: "t",
        description: "d",
        category: "AWARD",
      })
    );
    await expect(
      s.transaction(async (tx) => {
        const { postId } = await tx.publishAsPost(a.id, {
          authorId: user,
          title: "t",
          description: "d",
        });
        await tx.patchAchievement(a.id, {
          status: "PUBLISHED",
          publishedPostId: postId,
        });
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    expect(await db.prisma.post.count()).toBe(0);
    const reloaded = await db.prisma.achievement.findUniqueOrThrow({
      where: { id: a.id },
    });
    expect(reloaded.status).toBe("SUBMITTED");
    expect(reloaded.publishedPostId).toBeNull();
  });

  it("on success, exactly one post exists with post_type ACHIEVEMENT and the back-reference matches", async () => {
    const s = store();
    const a = await s.transaction((tx) =>
      tx.insertAchievement({
        userId: user,
        title: "t",
        description: "d",
        category: "AWARD",
      })
    );
    await s.transaction(async (tx) => {
      const { postId } = await tx.publishAsPost(a.id, {
        authorId: user,
        title: "t",
        description: "d",
      });
      await tx.patchAchievement(a.id, {
        status: "PUBLISHED",
        publishedPostId: postId,
      });
    });
    const posts = await db.prisma.post.findMany({
      where: { postType: "ACHIEVEMENT" },
    });
    expect(posts).toHaveLength(1);
    const reloaded = await db.prisma.achievement.findUniqueOrThrow({
      where: { id: a.id },
    });
    expect(reloaded.publishedPostId).toBe(posts[0]?.id);
  });

  it("listPending joins the submitter's identity as owner", async () => {
    const submitter = await db.prisma.user.create({
      data: { name: "Asha Rao", email: "asha@example.test" },
    });
    const s = store();
    await s.transaction((tx) =>
      tx.insertAchievement({
        userId: submitter.id,
        title: "t",
        description: "d",
        category: "AWARD",
      })
    );
    const rows = await s.transaction((tx) =>
      tx.listPending({ limit: 10, after: null })
    );
    expect(rows[0]?.owner).toEqual({ id: submitter.id, name: "Asha Rao" });
  });
});
