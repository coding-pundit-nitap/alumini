import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createOutboxWriter } from "@nitap/database/outbox";
import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createTransactionRunner } from "@/infrastructure/database/transaction-runner";
import { createPrismaModerationStore } from "@/modules/moderation/infrastructure/prisma-moderation-store";

describe("moderation store against real PostgreSQL", () => {
  let db: TestDatabase;
  let author: string;
  let reporter: string;
  let postId: string;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    [author, reporter] = await Promise.all([
      db.prisma.user
        .create({ data: { name: "author", email: "author@example.test" } })
        .then((u) => u.id),
      db.prisma.user
        .create({ data: { name: "reporter", email: "reporter@example.test" } })
        .then((u) => u.id),
    ]);
    postId = (
      await db.prisma.post.create({
        data: { authorId: author, content: "x", postType: "TEXT" },
      })
    ).id;
  });
  afterEach(async () => {
    await db.drop();
  });

  const store = () =>
    createPrismaModerationStore({
      runner: createTransactionRunner(db.prisma),
      outbox: createOutboxWriter(),
    });

  it("findReport refuses a MESSAGE-scoped report id (belongs to a different module's flow)", async () => {
    const s = store();
    const messageReport = await db.prisma.report.create({
      data: {
        reporterId: reporter,
        targetType: "MESSAGE",
        targetId: postId,
        reason: "spam",
      },
    });
    const found = await s.transaction((tx) => tx.findReport(messageReport.id));
    expect(found).toBeNull();
  });

  it("insertReport is atomic under a concurrent duplicate filing (uq_report_once)", async () => {
    const s = store();
    const [first, second] = await Promise.all([
      s.transaction((tx) =>
        tx.insertReport({
          reporterId: reporter,
          targetType: "POST",
          targetId: postId,
          reason: "spam",
        })
      ),
      s.transaction((tx) =>
        tx.insertReport({
          reporterId: reporter,
          targetType: "POST",
          targetId: postId,
          reason: "spam",
        })
      ),
    ]);
    expect(first.id).toBe(second.id);
    expect([first.created, second.created].sort()).toEqual([false, true]);
  });

  it("contentAuthor resolves a POST's author without any modules/posts import (direct SQL)", async () => {
    const s = store();
    const owner = await s.transaction((tx) => tx.contentAuthor("POST", postId));
    expect(owner).toBe(author);
  });

  it("resolving a report soft-deletes the post in the same transaction; a mid-transaction failure leaves both untouched", async () => {
    const s = store();
    const { id: reportId } = await s.transaction((tx) =>
      tx.insertReport({
        reporterId: reporter,
        targetType: "POST",
        targetId: postId,
        reason: "spam",
      })
    );
    await expect(
      s.transaction(async (tx) => {
        await tx.patchReport(reportId, {
          status: "RESOLVED",
          resolvedById: author,
        });
        await tx.softDeleteContent("POST", postId);
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    expect(
      (await db.prisma.report.findUniqueOrThrow({ where: { id: reportId } }))
        .status
    ).toBe("OPEN");
    expect(
      (await db.prisma.post.findUniqueOrThrow({ where: { id: postId } }))
        .deleted
    ).toBe(false);

    await s.transaction(async (tx) => {
      await tx.patchReport(reportId, {
        status: "RESOLVED",
        resolvedById: author,
      });
      await tx.softDeleteContent("POST", postId);
    });
    expect(
      (await db.prisma.report.findUniqueOrThrow({ where: { id: reportId } }))
        .status
    ).toBe("RESOLVED");
    expect(
      (await db.prisma.post.findUniqueOrThrow({ where: { id: postId } }))
        .deleted
    ).toBe(true);
  });
});
