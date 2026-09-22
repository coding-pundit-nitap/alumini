import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PERMISSIONS } from "@nitap/database/permissions";
import { createOutboxWriter } from "@nitap/database/outbox";
import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createTransactionRunner } from "@/infrastructure/database/transaction-runner";
import { AuthenticationError, AuthorizationError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";
import { createClaimReport } from "@/modules/moderation/application/claim-report";
import { createDismissReport } from "@/modules/moderation/application/dismiss-report";
import { createFileContentReport } from "@/modules/moderation/application/file-content-report";
import { createResolveReport } from "@/modules/moderation/application/resolve-report";
import { createPrismaModerationStore } from "@/modules/moderation/infrastructure/prisma-moderation-store";

const actor = (userId: string): Actor => ({
  userId,
  accountState: "VERIFIED",
  requestId: "r",
  grants: [],
});

/** Enforces REPORT_REVIEW against `reviewers`; everyone gets REPORT_CREATE. */
const authorizeWith =
  (reviewers: ReadonlySet<string>) => (a: Actor | null, permission: string) => {
    if (!a) throw new AuthenticationError();
    if (permission === PERMISSIONS.REPORT_REVIEW && !reviewers.has(a.userId)) {
      throw new AuthorizationError({ code: "PERMISSION_DENIED" });
    }
    return a;
  };

/** Resolves to the AppError code, or "ok". */
const code = (promise: Promise<unknown>) =>
  promise.then(
    () => "ok",
    (e: { code?: string }) => e.code ?? "error"
  );

async function member(db: TestDatabase, name: string) {
  const user = await db.prisma.user.create({
    data: {
      name,
      email: `${name.toLowerCase().replace(/\W/g, "")}@example.test`,
      accountState: "VERIFIED",
    },
  });
  return user.id;
}

describe("moderation use cases against real PostgreSQL", () => {
  let db: TestDatabase;
  let asha: string;
  let ravi: string;
  let postId: string;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    [asha, ravi] = [await member(db, "Asha"), await member(db, "Ravi")];
    postId = (
      await db.prisma.post.create({
        data: { authorId: asha, content: "x", postType: "TEXT" },
      })
    ).id;
  });
  afterEach(async () => {
    await db.drop();
  });

  function build(reviewers: ReadonlySet<string> = new Set()) {
    const store = createPrismaModerationStore({
      runner: createTransactionRunner(db.prisma),
      outbox: createOutboxWriter(),
    });
    const deps = { store, authorize: authorizeWith(reviewers) };
    return {
      file: createFileContentReport(deps),
      claim: createClaimReport(deps),
      resolve: createResolveReport(deps),
      dismiss: createDismissReport(deps),
    };
  }
  const events = (type: string) =>
    db.prisma.outboxEvent.findMany({ where: { type } });

  describe("file-content-report", () => {
    it("files a report against a POST and is idempotent per (reporter, target)", async () => {
      const m = build();
      const first = await m.file({
        actor: actor(ravi),
        input: { targetType: "POST", targetId: postId, reason: "spam" },
      });
      expect(first.created).toBe(true);
      const second = await m.file({
        actor: actor(ravi),
        input: { targetType: "POST", targetId: postId, reason: "spam" },
      });
      expect(second.created).toBe(false);
      expect(second.reportId).toBe(first.reportId);

      const [event] = await events("report.filed");
      expect(event?.payload).toEqual({
        v: 1,
        reportId: first.reportId,
        targetType: "POST",
        targetId: postId,
        reporterId: ravi,
      });
    });

    it("refuses filing against a nonexistent target (NOT_FOUND)", async () => {
      const m = build();
      expect(
        await code(
          m.file({
            actor: actor(ravi),
            input: {
              targetType: "POST",
              targetId: "00000000-0000-0000-0000-000000000000",
              reason: "spam",
            },
          })
        )
      ).toBe("NOT_FOUND");
    });
  });

  it("claim/resolve/dismiss refuse NOT_FOUND on a MESSAGE-scoped report id (cross-module leak guard)", async () => {
    const meera = await member(db, "Meera");
    const m = build(new Set([meera]));
    const messageReport = await db.prisma.report.create({
      data: {
        reporterId: ravi,
        targetType: "MESSAGE",
        targetId: postId,
        reason: "spam",
      },
    });
    expect(
      await code(m.claim({ actor: actor(meera), reportId: messageReport.id }))
    ).toBe("NOT_FOUND");
    expect(
      await code(m.resolve({ actor: actor(meera), reportId: messageReport.id }))
    ).toBe("NOT_FOUND");
    expect(
      await code(m.dismiss({ actor: actor(meera), reportId: messageReport.id }))
    ).toBe("NOT_FOUND");
  });

  describe("claim-report", () => {
    it("a non-self moderator claims: OPEN -> UNDER_REVIEW, resolvedById left unset", async () => {
      const m = build(new Set([ravi]));
      const { reportId } = await m.file({
        actor: actor(ravi),
        input: { targetType: "POST", targetId: postId, reason: "spam" },
      });
      const meera = await member(db, "Meera");
      const m2 = build(new Set([meera]));
      await m2.claim({ actor: actor(meera), reportId });

      const row = await db.prisma.report.findUniqueOrThrow({
        where: { id: reportId },
      });
      expect(row.status).toBe("UNDER_REVIEW");
      expect(row.resolvedById).toBeNull();
    });

    it("refuses claim by the reporter or the content author (SELF_REVIEW_FORBIDDEN)", async () => {
      const m = build(new Set([ravi, asha]));
      const { reportId } = await m.file({
        actor: actor(ravi),
        input: { targetType: "POST", targetId: postId, reason: "spam" },
      });
      expect(await code(m.claim({ actor: actor(ravi), reportId }))).toBe(
        "SELF_REVIEW_FORBIDDEN"
      );
      expect(await code(m.claim({ actor: actor(asha), reportId }))).toBe(
        "SELF_REVIEW_FORBIDDEN"
      );
    });
  });

  describe("resolve-report", () => {
    it("resolves from OPEN directly: soft-deletes the target, emits report.resolved + content.removed", async () => {
      const meera = await member(db, "Meera");
      const m = build(new Set([meera]));
      const { reportId } = await m.file({
        actor: actor(ravi),
        input: { targetType: "POST", targetId: postId, reason: "spam" },
      });
      await m.resolve({ actor: actor(meera), reportId });

      const row = await db.prisma.report.findUniqueOrThrow({
        where: { id: reportId },
      });
      expect(row.status).toBe("RESOLVED");
      expect(row.resolvedById).toBe(meera);
      const post = await db.prisma.post.findUniqueOrThrow({
        where: { id: postId },
      });
      expect(post.deleted).toBe(true);

      const [resolved] = await events("report.resolved");
      expect(resolved?.payload).toEqual({
        v: 1,
        reportId,
        outcome: "resolved",
      });
      const [removed] = await events("content.removed");
      expect(removed?.payload).toEqual({
        v: 1,
        targetType: "POST",
        targetId: postId,
        reportId,
      });
    });

    it("refuses resolve by the reporter or the content author (SELF_REVIEW_FORBIDDEN)", async () => {
      const m = build(new Set([ravi, asha]));
      const { reportId } = await m.file({
        actor: actor(ravi),
        input: { targetType: "POST", targetId: postId, reason: "spam" },
      });
      expect(await code(m.resolve({ actor: actor(ravi), reportId }))).toBe(
        "SELF_REVIEW_FORBIDDEN"
      );
      expect(await code(m.resolve({ actor: actor(asha), reportId }))).toBe(
        "SELF_REVIEW_FORBIDDEN"
      );
      const post = await db.prisma.post.findUniqueOrThrow({
        where: { id: postId },
      });
      expect(post.deleted).toBe(false);
    });

    it("refuses resolving an already-terminal report (INVALID_STATE_TRANSITION)", async () => {
      const meera = await member(db, "Meera");
      const m = build(new Set([meera]));
      const { reportId } = await m.file({
        actor: actor(ravi),
        input: { targetType: "POST", targetId: postId, reason: "spam" },
      });
      await m.resolve({ actor: actor(meera), reportId });
      expect(await code(m.resolve({ actor: actor(meera), reportId }))).toBe(
        "INVALID_STATE_TRANSITION"
      );
    });
  });

  describe("dismiss-report", () => {
    it("dismisses: target untouched, emits only report.resolved with outcome dismissed", async () => {
      const meera = await member(db, "Meera");
      const m = build(new Set([meera]));
      const { reportId } = await m.file({
        actor: actor(ravi),
        input: { targetType: "POST", targetId: postId, reason: "spam" },
      });
      await m.dismiss({ actor: actor(meera), reportId });

      const row = await db.prisma.report.findUniqueOrThrow({
        where: { id: reportId },
      });
      expect(row.status).toBe("DISMISSED");
      expect(row.resolvedById).toBe(meera);
      const post = await db.prisma.post.findUniqueOrThrow({
        where: { id: postId },
      });
      expect(post.deleted).toBe(false);

      const resolvedEvents = await events("report.resolved");
      expect(resolvedEvents).toHaveLength(1);
      expect(resolvedEvents[0]?.payload).toEqual({
        v: 1,
        reportId,
        outcome: "dismissed",
      });
      expect(await events("content.removed")).toHaveLength(0);
    });

    it("refuses dismiss by the reporter or the content author (SELF_REVIEW_FORBIDDEN)", async () => {
      const m = build(new Set([ravi, asha]));
      const { reportId } = await m.file({
        actor: actor(ravi),
        input: { targetType: "POST", targetId: postId, reason: "spam" },
      });
      expect(await code(m.dismiss({ actor: actor(ravi), reportId }))).toBe(
        "SELF_REVIEW_FORBIDDEN"
      );
      expect(await code(m.dismiss({ actor: actor(asha), reportId }))).toBe(
        "SELF_REVIEW_FORBIDDEN"
      );
    });

    it("refuses dismissing an already-terminal report (INVALID_STATE_TRANSITION)", async () => {
      const meera = await member(db, "Meera");
      const m = build(new Set([meera]));
      const { reportId } = await m.file({
        actor: actor(ravi),
        input: { targetType: "POST", targetId: postId, reason: "spam" },
      });
      await m.dismiss({ actor: actor(meera), reportId });
      expect(await code(m.dismiss({ actor: actor(meera), reportId }))).toBe(
        "INVALID_STATE_TRANSITION"
      );
    });
  });
});
