import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAuditWriter } from "@nitap/database/audit";
import { createOutboxWriter } from "@nitap/database/outbox";
import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createTransactionRunner } from "@/infrastructure/database/transaction-runner";
import type { Actor } from "@/modules/auth";
import { createListReports } from "@/modules/moderation/application/list-reports";
import { createPrismaModerationStore } from "@/modules/moderation/infrastructure/prisma-moderation-store";

const actor = (userId: string): Actor => ({
  userId,
  accountState: "VERIFIED",
  requestId: "r",
  grants: [],
});

describe("listReports against real PostgreSQL", () => {
  let db: TestDatabase;
  let author: string;
  let reporter: string;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    author = (
      await db.prisma.user.create({
        data: { name: "Asha", email: "asha@example.test" },
      })
    ).id;
    reporter = (
      await db.prisma.user.create({
        data: { name: "Ravi", email: "ravi@example.test" },
      })
    ).id;
  });
  afterEach(async () => {
    await db.drop();
  });

  const list = () =>
    createListReports({
      store: createPrismaModerationStore({
        runner: createTransactionRunner(db.prisma),
        outbox: createOutboxWriter(),
        audit: createAuditWriter(),
      }),
      authorize: (a) => a!,
    });

  async function seedAllTypes() {
    const post = await db.prisma.post.create({
      data: {
        authorId: author,
        content: "p".repeat(200),
        postType: "TEXT",
        deleted: true,
      },
    });
    const comment = await db.prisma.comment.create({
      data: { postId: post.id, authorId: author, body: "a comment" },
    });
    const [lo, hi] = [author, reporter].sort();
    const conversation = await db.prisma.conversation.create({
      data: {
        createdById: author,
        isGroup: false,
        directPairKey: `${lo}:${hi}`,
      },
    });
    const message = await db.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: author,
        body: "SECRET-TEXT",
        clientMessageId: crypto.randomUUID(),
      },
    });
    const make = (
      targetType: "POST" | "COMMENT" | "MESSAGE" | "USER",
      targetId: string,
      status: "OPEN" | "RESOLVED" = "OPEN"
    ) =>
      db.prisma.report.create({
        data: {
          reporterId: reporter,
          targetType,
          targetId,
          reason: "why",
          status,
          // ck_report_resolved: RESOLVED/DISMISSED rows require resolved_by_id set.
          ...(status === "RESOLVED" ? { resolvedById: author } : {}),
        },
      });
    return {
      post: await make("POST", post.id),
      comment: await make("COMMENT", comment.id),
      message: await make("MESSAGE", message.id),
      user: await make("USER", author),
      resolved: await make("POST", comment.id, "RESOLVED"),
      messageId: message.id,
    };
  }

  it("lists open reports of every type, newest first, with a per-type preview and no message text", async () => {
    const r = await seedAllTypes();
    const page = await list()({ actor: actor(reporter), query: {} });
    expect(page.data.map((d) => d.id)).toEqual([
      r.user.id,
      r.message.id,
      r.comment.id,
      r.post.id,
    ]);
    const byType = Object.fromEntries(page.data.map((d) => [d.targetType, d]));
    expect(byType.POST!.preview).toEqual({
      text: "p".repeat(140),
      deleted: true,
    });
    expect(byType.COMMENT!.preview).toEqual({
      text: "a comment",
      deleted: false,
    });
    expect(byType.USER!.preview).toEqual({ text: "Asha", deleted: false });
    expect(byType.MESSAGE!.preview).toBeNull();
    expect(byType.MESSAGE!.targetOwnerId).toBe(author);
    expect(byType.POST!.reporter).toEqual({ id: reporter, name: "Ravi" });
    expect(JSON.stringify(page)).not.toContain("SECRET-TEXT");
  });

  it("filters by status and target type, and pages without gaps", async () => {
    const r = await seedAllTypes();
    expect(
      (
        await list()({ actor: actor(reporter), query: { status: "RESOLVED" } })
      ).data.map((d) => d.id)
    ).toEqual([r.resolved.id]);
    expect(
      (
        await list()({
          actor: actor(reporter),
          query: { targetType: "MESSAGE" },
        })
      ).data.map((d) => d.id)
    ).toEqual([r.message.id]);
    const first = await list()({
      actor: actor(reporter),
      query: { limit: "3" },
    });
    const second = await list()({
      actor: actor(reporter),
      query: { limit: "3", cursor: first.nextCursor! },
    });
    expect([...first.data, ...second.data].map((d) => d.id)).toEqual([
      r.user.id,
      r.message.id,
      r.comment.id,
      r.post.id,
    ]);
    expect(second.nextCursor).toBeNull();
  });

  it("lists a report whose target is gone, with a null preview (Review Focus 5)", async () => {
    await db.prisma.report.create({
      data: {
        reporterId: reporter,
        targetType: "POST",
        targetId: "00000000-0000-4000-8000-000000000999",
        reason: "x",
      },
    });
    const [row] = (await list()({ actor: actor(reporter), query: {} })).data;
    expect(row).toMatchObject({ preview: null, targetOwnerId: null });
  });
});
