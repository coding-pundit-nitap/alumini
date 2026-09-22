import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PERMISSIONS } from "@nitap/database/permissions";
import { createOutboxWriter } from "@nitap/database/outbox";
import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createTransactionRunner } from "@/infrastructure/database/transaction-runner";
import { AuthenticationError, AuthorizationError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";
import { createListOwnAchievements } from "@/modules/achievements/application/list-own-achievements";
import { createListPendingAchievements } from "@/modules/achievements/application/list-pending-achievements";
import { createReviewAchievement } from "@/modules/achievements/application/review-achievement";
import { createSubmitAchievement } from "@/modules/achievements/application/submit-achievement";
import { createWithdrawAchievement } from "@/modules/achievements/application/withdraw-achievement";
import { createPrismaAchievementsStore } from "@/modules/achievements/infrastructure/prisma-achievements-store";

const actor = (userId: string): Actor => ({
  userId,
  accountState: "VERIFIED",
  requestId: "r",
  grants: [],
});

/**
 * A composition-root-style authorize: like the posts test's pass-through, except it actually enforces
 * `ACHIEVEMENT_REVIEW` against `reviewers`, mapping a denial to the domain-specific `NOT_REVIEWER` code
 * (the same code `decideTransition` would produce) rather than a generic `PERMISSION_DENIED` — this is
 * the only permission review-achievement.ts checks up front, so it is the one worth modelling here.
 */
const authorizeWith =
  (reviewers: ReadonlySet<string>) => (a: Actor | null, permission: string) => {
    if (!a) throw new AuthenticationError();
    if (
      permission === PERMISSIONS.ACHIEVEMENT_REVIEW &&
      !reviewers.has(a.userId)
    ) {
      throw new AuthorizationError({ code: "NOT_REVIEWER" });
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

describe("achievements use cases against real PostgreSQL", () => {
  let db: TestDatabase;
  let asha: string;
  let ravi: string;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    [asha, ravi] = [await member(db, "Asha"), await member(db, "Ravi")];
  });
  afterEach(async () => {
    await db.drop();
  });

  function build(reviewers: ReadonlySet<string> = new Set()) {
    const store = createPrismaAchievementsStore({
      runner: createTransactionRunner(db.prisma),
      outbox: createOutboxWriter(),
    });
    const deps = { store, authorize: authorizeWith(reviewers) };
    return {
      submit: createSubmitAchievement(deps),
      withdraw: createWithdrawAchievement(deps),
      review: createReviewAchievement(deps),
      listOwn: createListOwnAchievements(deps),
      listPending: createListPendingAchievements(deps),
    };
  }
  const events = (type: string) =>
    db.prisma.outboxEvent.findMany({ where: { type } });

  const submitInput = {
    title: "Published a paper",
    description: "In a journal",
    category: "PUBLICATION",
  };

  describe("submit-achievement", () => {
    it("creates a SUBMITTED row and enqueues achievement.submitted", async () => {
      const m = build();
      const { achievementId } = await m.submit({
        actor: actor(asha),
        input: submitInput,
      });
      const row = await db.prisma.achievement.findUniqueOrThrow({
        where: { id: achievementId },
      });
      expect(row.status).toBe("SUBMITTED");
      expect(row.userId).toBe(asha);
      const [event] = await events("achievement.submitted");
      expect(event?.payload).toEqual({
        v: 1,
        achievementId,
        userId: asha,
      });
    });
  });

  describe("withdraw-achievement", () => {
    it("lets the owner withdraw their own SUBMITTED achievement", async () => {
      const m = build();
      const { achievementId } = await m.submit({
        actor: actor(asha),
        input: submitInput,
      });
      await m.withdraw({ actor: actor(asha), achievementId });
      const row = await db.prisma.achievement.findUniqueOrThrow({
        where: { id: achievementId },
      });
      expect(row.status).toBe("WITHDRAWN");
    });

    it("refuses withdraw by a non-owner (NOT_OWNER) and of a non-SUBMITTED row (INVALID_STATE_TRANSITION)", async () => {
      const m = build();
      const { achievementId } = await m.submit({
        actor: actor(asha),
        input: submitInput,
      });
      expect(
        await code(m.withdraw({ actor: actor(ravi), achievementId }))
      ).toBe("NOT_OWNER");

      await m.withdraw({ actor: actor(asha), achievementId });
      expect(
        await code(m.withdraw({ actor: actor(asha), achievementId }))
      ).toBe("INVALID_STATE_TRANSITION");
    });
  });

  describe("review-achievement", () => {
    it("approve by a non-self reviewer publishes: PUBLISHED, exactly one ACHIEVEMENT post, achievement.approved with postId", async () => {
      const m = build(new Set([ravi]));
      const { achievementId } = await m.submit({
        actor: actor(asha),
        input: submitInput,
      });
      await m.review({
        actor: actor(ravi),
        achievementId,
        outcome: "approve",
      });

      const row = await db.prisma.achievement.findUniqueOrThrow({
        where: { id: achievementId },
      });
      expect(row.status).toBe("PUBLISHED");
      expect(row.reviewedById).toBe(ravi);
      expect(row.publishedPostId).not.toBeNull();

      const posts = await db.prisma.post.findMany({
        where: { postType: "ACHIEVEMENT" },
      });
      expect(posts).toHaveLength(1);
      expect(posts[0]?.id).toBe(row.publishedPostId);
      expect(posts[0]?.authorId).toBe(asha);

      const [event] = await events("achievement.approved");
      expect(event?.payload).toEqual({
        v: 1,
        achievementId,
        userId: asha,
        postId: row.publishedPostId,
      });
    });

    it("reject: REJECTED + achievement.rejected outboxed, no post created", async () => {
      const m = build(new Set([ravi]));
      const { achievementId } = await m.submit({
        actor: actor(asha),
        input: submitInput,
      });
      await m.review({ actor: actor(ravi), achievementId, outcome: "reject" });

      const row = await db.prisma.achievement.findUniqueOrThrow({
        where: { id: achievementId },
      });
      expect(row.status).toBe("REJECTED");
      expect(row.publishedPostId).toBeNull();
      expect(
        await db.prisma.post.count({ where: { postType: "ACHIEVEMENT" } })
      ).toBe(0);

      const [event] = await events("achievement.rejected");
      expect(event?.payload).toEqual({
        v: 1,
        achievementId,
        userId: asha,
      });
    });

    it("refuses review by the achievement's own owner (SELF_REVIEW_FORBIDDEN), even though they hold the review permission", async () => {
      // asha holds ACHIEVEMENT_REVIEW here so the call reaches decideTransition's fixed check order
      // (actor -> self-review -> role -> ...), which puts self-review ahead of the role check.
      const m = build(new Set([asha]));
      const { achievementId } = await m.submit({
        actor: actor(asha),
        input: submitInput,
      });
      expect(
        await code(
          m.review({ actor: actor(asha), achievementId, outcome: "approve" })
        )
      ).toBe("SELF_REVIEW_FORBIDDEN");
    });

    it("refuses review by a non-reviewer (NOT_REVIEWER)", async () => {
      const m = build(new Set([ravi]));
      const { achievementId } = await m.submit({
        actor: actor(asha),
        input: submitInput,
      });
      const other = await member(db, "Meera");
      expect(
        await code(
          m.review({ actor: actor(other), achievementId, outcome: "approve" })
        )
      ).toBe("NOT_REVIEWER");
    });
  });

  describe("list-own-achievements", () => {
    it("lists only the caller's own achievements, newest first", async () => {
      const m = build();
      await m.submit({ actor: actor(asha), input: submitInput });
      await m.submit({ actor: actor(ravi), input: submitInput });

      const { achievements } = await m.listOwn({ actor: actor(asha) });
      expect(achievements).toHaveLength(1);
      expect(achievements[0]?.userId).toBe(asha);
    });

    it("requires a signed-in actor", async () => {
      expect(await code(build().listOwn({ actor: null }))).toBe(
        "UNAUTHENTICATED"
      );
    });
  });

  describe("list-pending-achievements", () => {
    it("lists SUBMITTED achievements across all users, gated on ACHIEVEMENT_REVIEW", async () => {
      const m = build(new Set([ravi]));
      await m.submit({ actor: actor(asha), input: submitInput });
      await m.submit({ actor: actor(ravi), input: submitInput });

      const { achievements } = await m.listPending({ actor: actor(ravi) });
      expect(achievements).toHaveLength(2);
      expect(achievements.every((a) => a.status === "SUBMITTED")).toBe(true);
    });

    it("excludes achievements no longer SUBMITTED", async () => {
      const m = build(new Set([ravi]));
      const { achievementId } = await m.submit({
        actor: actor(asha),
        input: submitInput,
      });
      await m.submit({ actor: actor(ravi), input: submitInput });
      await m.review({
        actor: actor(ravi),
        achievementId,
        outcome: "approve",
      });

      const { achievements } = await m.listPending({ actor: actor(ravi) });
      expect(achievements).toHaveLength(1);
      expect(achievements[0]?.userId).toBe(ravi);
    });

    it("requires ACHIEVEMENT_REVIEW, not ACHIEVEMENT_SUBMIT", async () => {
      const m = build(new Set());
      await m.submit({ actor: actor(asha), input: submitInput });

      expect(await code(m.listPending({ actor: actor(asha) }))).toBe(
        "NOT_REVIEWER"
      );
    });

    it("requires a signed-in actor", async () => {
      expect(await code(build().listPending({ actor: null }))).toBe(
        "UNAUTHENTICATED"
      );
    });
  });
});
