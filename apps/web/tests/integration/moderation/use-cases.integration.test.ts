import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PERMISSIONS } from "@nitap/database/permissions";
import { createAuditWriter } from "@nitap/database/audit";
import { createOutboxWriter } from "@nitap/database/outbox";
import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createTransactionRunner } from "@/infrastructure/database/transaction-runner";
import { AuthenticationError, AuthorizationError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";
import { createClaimReport } from "@/modules/moderation/application/claim-report";
import { createDismissReport } from "@/modules/moderation/application/dismiss-report";
import { createFileContentReport } from "@/modules/moderation/application/file-content-report";
import type { ModerationStore } from "@/modules/moderation/application/moderation-store";
import { createResolveReport } from "@/modules/moderation/application/resolve-report";
import { createPrismaModerationStore } from "@/modules/moderation/infrastructure/prisma-moderation-store";

/**
 * Resolves once `n` callers have reached it, so none proceeds before all have
 * arrived. Can't deadlock: it runs before any lock is taken.
 */
function barrier(n: number) {
  let arrived = 0;
  let release: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return async () => {
    arrived += 1;
    if (arrived >= n) release();
    await gate;
  };
}

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

  function build(
    reviewers: ReadonlySet<string> = new Set(),
    wrapStore?: (store: ModerationStore) => ModerationStore
  ) {
    const store = createPrismaModerationStore({
      runner: createTransactionRunner(db.prisma),
      outbox: createOutboxWriter(),
      audit: createAuditWriter(),
    });
    const deps = {
      store: wrapStore ? wrapStore(store) : store,
      authorize: authorizeWith(reviewers),
    };
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

  describe("MESSAGE and USER reports", () => {
    async function reportedMessage(senderId: string, reporterId: string) {
      const [lo, hi] = [senderId, reporterId].sort();
      const conversation = await db.prisma.conversation.create({
        data: {
          createdById: senderId,
          isGroup: false,
          directPairKey: `${lo}:${hi}`,
        },
      });
      await db.prisma.conversationParticipant.createMany({
        data: [
          { conversationId: conversation.id, userId: senderId },
          { conversationId: conversation.id, userId: reporterId },
        ],
      });
      const message = await db.prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderId,
          body: "rude",
          clientMessageId: crypto.randomUUID(),
        },
      });
      const report = await db.prisma.report.create({
        data: {
          reporterId,
          targetType: "MESSAGE",
          targetId: message.id,
          reason: "rude",
        },
      });
      return { messageId: message.id, reportId: report.id };
    }

    it("resolving a MESSAGE report hides it and audits report.resolved + message.hidden, no content.removed", async () => {
      const meera = await member(db, "Meera");
      const m = build(new Set([meera]));
      const { messageId, reportId } = await reportedMessage(asha, ravi);
      await m.resolve({
        actor: actor(meera),
        reportId,
        input: { reason: "SPAM" },
      });

      const message = await db.prisma.message.findUniqueOrThrow({
        where: { id: messageId },
      });
      expect(message.hiddenAt).not.toBeNull();
      const audit = await db.prisma.auditLog.findMany({
        orderBy: { action: "asc" },
      });
      expect(audit.map((a) => [a.action, a.targetType, a.targetId])).toEqual([
        ["message.hidden", "message", messageId],
        ["report.resolved", "report", reportId],
      ]);
      expect(audit[0]!.metadata).toEqual({ reportId });
      expect(await events("content.removed")).toHaveLength(0);
      expect(await events("report.resolved")).toHaveLength(1);
    });

    it("a moderator who sent the reported message may not claim, resolve or dismiss it", async () => {
      const m = build(new Set([asha]));
      const { reportId } = await reportedMessage(asha, ravi);
      expect(await code(m.claim({ actor: actor(asha), reportId }))).toBe(
        "SELF_REVIEW_FORBIDDEN"
      );
      expect(
        await code(
          m.resolve({ actor: actor(asha), reportId, input: { reason: "SPAM" } })
        )
      ).toBe("SELF_REVIEW_FORBIDDEN");
      expect(
        await code(
          m.dismiss({
            actor: actor(asha),
            reportId,
            input: { reason: "NO_VIOLATION" },
          })
        )
      ).toBe("SELF_REVIEW_FORBIDDEN");
    });

    it("resolving a report on a message that no longer exists succeeds without a message.hidden row", async () => {
      const meera = await member(db, "Meera");
      const m = build(new Set([meera]));
      const report = await db.prisma.report.create({
        data: {
          reporterId: ravi,
          targetType: "MESSAGE",
          targetId: "00000000-0000-4000-8000-000000000999",
          reason: "gone",
        },
      });
      await m.resolve({
        actor: actor(meera),
        reportId: report.id,
        input: { reason: "SPAM" },
      });
      expect(
        (await db.prisma.report.findUniqueOrThrow({ where: { id: report.id } }))
          .status
      ).toBe("RESOLVED");
      expect(
        await db.prisma.auditLog.count({ where: { action: "message.hidden" } })
      ).toBe(0);
    });

    it("a USER report resolves with no side effect; the user may not review a report about themselves", async () => {
      const meera = await member(db, "Meera");
      const m = build(new Set([meera, asha]));
      const report = await db.prisma.report.create({
        data: {
          reporterId: ravi,
          targetType: "USER",
          targetId: asha,
          reason: "impersonation",
        },
      });
      expect(
        await code(
          m.resolve({
            actor: actor(asha),
            reportId: report.id,
            input: { reason: "SPAM" },
          })
        )
      ).toBe("SELF_REVIEW_FORBIDDEN");
      await m.resolve({
        actor: actor(meera),
        reportId: report.id,
        input: { reason: "SPAM" },
      });
      const user = await db.prisma.user.findUniqueOrThrow({
        where: { id: asha },
      });
      expect(user.accountState).toBe("VERIFIED");
      expect(
        (await db.prisma.auditLog.findMany()).map((a) => a.action)
      ).toEqual(["report.resolved"]);
    });
  });

  it("two concurrent resolutions of one report: one wins, the other is INVALID_STATE_TRANSITION (Review Focus 1)", async () => {
    const [meera, kiran] = [
      await member(db, "Meera"),
      await member(db, "Kiran"),
    ];
    const filer = build(new Set([meera, kiran]));
    const { reportId } = await filer.file({
      actor: actor(ravi),
      input: { targetType: "POST", targetId: postId, reason: "spam" },
    });
    // Barrier only around the two racing decisions, so filing (an earlier, unrelated
    // transaction) isn't held up waiting for a second arrival that never comes.
    const gate = barrier(2);
    const m = build(new Set([meera, kiran]), (store) => ({
      transaction: (work) =>
        store.transaction(async (tx) => {
          // Both resolutions must enter before either reaches findReport, so the
          // race genuinely exercises the row lock instead of racing connection setup.
          await gate();
          return work(tx);
        }),
    }));
    const outcomes = await Promise.all([
      code(
        m.resolve({ actor: actor(meera), reportId, input: { reason: "SPAM" } })
      ),
      code(
        m.dismiss({
          actor: actor(kiran),
          reportId,
          input: { reason: "NO_VIOLATION" },
        })
      ),
    ]);
    expect(outcomes.sort()).toEqual(["INVALID_STATE_TRANSITION", "ok"]);
    expect(
      await db.prisma.auditLog.count({
        where: { action: { in: ["report.resolved", "report.dismissed"] } },
      })
    ).toBe(1);
    expect(await events("report.resolved")).toHaveLength(1);
  });

  it("a refused reason writes nothing", async () => {
    const meera = await member(db, "Meera");
    const m = build(new Set([meera]));
    const { reportId } = await m.file({
      actor: actor(ravi),
      input: { targetType: "POST", targetId: postId, reason: "spam" },
    });
    expect(
      await code(
        m.resolve({
          actor: actor(meera),
          reportId,
          input: { reason: "because" },
        })
      )
    ).toBe("VALIDATION_FAILED");
    expect(
      (await db.prisma.report.findUniqueOrThrow({ where: { id: reportId } }))
        .status
    ).toBe("OPEN");
    expect(await db.prisma.auditLog.count()).toBe(0);
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
      await m.resolve({
        actor: actor(meera),
        reportId,
        input: { reason: "SPAM" },
      });

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
      expect(
        await code(
          m.resolve({ actor: actor(ravi), reportId, input: { reason: "SPAM" } })
        )
      ).toBe("SELF_REVIEW_FORBIDDEN");
      expect(
        await code(
          m.resolve({ actor: actor(asha), reportId, input: { reason: "SPAM" } })
        )
      ).toBe("SELF_REVIEW_FORBIDDEN");
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
      await m.resolve({
        actor: actor(meera),
        reportId,
        input: { reason: "SPAM" },
      });
      expect(
        await code(
          m.resolve({
            actor: actor(meera),
            reportId,
            input: { reason: "SPAM" },
          })
        )
      ).toBe("INVALID_STATE_TRANSITION");
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
      await m.dismiss({
        actor: actor(meera),
        reportId,
        input: { reason: "NO_VIOLATION" },
      });

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
      expect(
        await code(
          m.dismiss({
            actor: actor(ravi),
            reportId,
            input: { reason: "NO_VIOLATION" },
          })
        )
      ).toBe("SELF_REVIEW_FORBIDDEN");
      expect(
        await code(
          m.dismiss({
            actor: actor(asha),
            reportId,
            input: { reason: "NO_VIOLATION" },
          })
        )
      ).toBe("SELF_REVIEW_FORBIDDEN");
    });

    it("refuses dismissing an already-terminal report (INVALID_STATE_TRANSITION)", async () => {
      const meera = await member(db, "Meera");
      const m = build(new Set([meera]));
      const { reportId } = await m.file({
        actor: actor(ravi),
        input: { targetType: "POST", targetId: postId, reason: "spam" },
      });
      await m.dismiss({
        actor: actor(meera),
        reportId,
        input: { reason: "NO_VIOLATION" },
      });
      expect(
        await code(
          m.dismiss({
            actor: actor(meera),
            reportId,
            input: { reason: "NO_VIOLATION" },
          })
        )
      ).toBe("INVALID_STATE_TRANSITION");
    });
  });

  describe("audit", () => {
    const auditRows = () =>
      db.prisma.auditLog.findMany({
        orderBy: [{ createdAt: "asc" }, { action: "asc" }],
        select: {
          action: true,
          targetType: true,
          targetId: true,
          actorId: true,
          metadata: true,
        },
      });
    const fileSpam = (m: ReturnType<typeof build>) =>
      m.file({
        actor: actor(ravi),
        input: { targetType: "POST", targetId: postId, reason: "spam" },
      });

    it("audits a claim, then a resolution together with the content removal", async () => {
      const meera = await member(db, "Meera");
      const m = build(new Set([meera]));
      const { reportId } = await fileSpam(m);
      await m.claim({ actor: actor(meera), reportId });
      await m.resolve({
        actor: actor(meera),
        reportId,
        input: { reason: "SPAM" },
      });

      const rows = await auditRows();
      expect(rows).toHaveLength(3);
      expect(rows).toEqual(
        expect.arrayContaining([
          {
            action: "report.claimed",
            targetType: "report",
            targetId: reportId,
            actorId: meera,
            metadata: { targetType: "POST", targetId: postId },
          },
          {
            action: "report.resolved",
            targetType: "report",
            targetId: reportId,
            actorId: meera,
            metadata: { targetType: "POST", targetId: postId, reason: "SPAM" },
          },
          {
            action: "post.removed",
            targetType: "post",
            targetId: postId,
            actorId: meera,
            metadata: { reportId },
          },
        ])
      );
    });

    it("audits a dismissal", async () => {
      const meera = await member(db, "Meera");
      const m = build(new Set([meera]));
      const { reportId } = await fileSpam(m);
      await m.dismiss({
        actor: actor(meera),
        reportId,
        input: { reason: "NO_VIOLATION" },
      });
      const rows = await auditRows();
      expect(rows.map((r) => r.action)).toEqual(["report.dismissed"]);
      expect(rows[0]?.metadata).toMatchObject({ reason: "NO_VIOLATION" });
    });

    it("writes no audit row when the resolution is refused", async () => {
      const meera = await member(db, "Meera");
      const m = build(new Set([meera]));
      const { reportId } = await fileSpam(m);
      await m.dismiss({
        actor: actor(meera),
        reportId,
        input: { reason: "NO_VIOLATION" },
      });
      expect(
        await code(
          m.resolve({
            actor: actor(meera),
            reportId,
            input: { reason: "SPAM" },
          })
        )
      ).toBe("INVALID_STATE_TRANSITION");
      expect((await auditRows()).map((r) => r.action)).toEqual([
        "report.dismissed",
      ]);
      // The post survived: the refused resolution removed nothing.
      expect(
        (await db.prisma.post.findUniqueOrThrow({ where: { id: postId } }))
          .deleted
      ).toBe(false);
    });
  });
});
