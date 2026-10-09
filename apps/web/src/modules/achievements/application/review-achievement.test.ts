import { describe, expect, it, vi } from "vitest";

import { AuthorizationError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { decideTransition } from "../domain/achievement";
import { createReviewAchievement } from "./review-achievement";
import type { AchievementRow, AchievementsTx } from "./achievements-store";
import { refuse } from "./refusal";

const actor: Actor = {
  userId: "reviewer1",
  accountState: "VERIFIED",
  requestId: "r",
  grants: [],
};
const authorize = vi.fn((a: Actor | null) => a as Actor);

const row = (over: Partial<AchievementRow> = {}): AchievementRow => ({
  id: "a1",
  userId: "owner1",
  title: "t",
  description: "d",
  category: "AWARD",
  status: "SUBMITTED",
  reviewedById: null,
  publishedPostId: null,
  createdAt: new Date(),
  ...over,
});

function fakeTx(found: AchievementRow | null): AchievementsTx {
  return {
    insertAchievement: vi.fn(),
    findAchievement: vi.fn(async () => found),
    patchAchievement: vi.fn(async () => {}),
    publishAsPost: vi.fn(async () => ({ postId: "p1" })),
    listOwn: vi.fn(),
    enqueue: vi.fn(),
    audit: vi.fn(async () => {}),
  } as unknown as AchievementsTx;
}

describe("reviewAchievement", () => {
  it("approves: publishes as post and patches status in the same transaction", async () => {
    const tx = fakeTx(row());
    const store = { transaction: vi.fn((work) => work(tx)) };
    await createReviewAchievement({ store, authorize })({
      actor,
      achievementId: "a1",
      outcome: "approve",
    });
    expect(tx.publishAsPost).toHaveBeenCalled();
    expect(tx.patchAchievement).toHaveBeenCalledWith(
      "a1",
      expect.objectContaining({ status: "PUBLISHED" })
    );
  });

  it("refuses a self-review (SELF_REVIEW_FORBIDDEN) and writes nothing", async () => {
    const tx = fakeTx(row({ userId: actor.userId }));
    const store = { transaction: vi.fn((work) => work(tx)) };
    await expect(
      createReviewAchievement({ store, authorize })({
        actor,
        achievementId: "a1",
        outcome: "approve",
      })
    ).rejects.toMatchObject({ code: "SELF_REVIEW_FORBIDDEN" });
    expect(tx.patchAchievement).not.toHaveBeenCalled();
  });

  /**
   * `reviewAchievement` always passes `isReviewer: true`, so this checks the
   * refusal path directly.
   */
  it("propagates the domain's NOT_REVIEWER refusal as AuthorizationError when isReviewer is false", () => {
    const decision = decideTransition(
      row(),
      "someoneElse",
      { action: "review", outcome: "approve" },
      false
    );
    expect(decision).toEqual({ ok: false, code: "NOT_REVIEWER" });
    expect(() => {
      if (!decision.ok) refuse(decision);
    }).toThrow(AuthorizationError);
    try {
      if (!decision.ok) refuse(decision);
    } catch (e) {
      expect((e as { code?: string }).code).toBe("NOT_REVIEWER");
    }
  });

  it.each([
    ["approve", "achievement.approved"],
    ["reject", "achievement.rejected"],
  ] as const)(
    "audits %s as %s in the same transaction",
    async (outcome, action) => {
      const tx = fakeTx(row());
      const store = { transaction: vi.fn((work) => work(tx)) };
      await createReviewAchievement({ store, authorize })({
        actor,
        achievementId: "a1",
        outcome,
      });
      expect(tx.audit).toHaveBeenCalledWith({
        action,
        actorId: "reviewer1",
        achievementId: "a1",
        ownerId: "owner1",
      });
    }
  );

  it("writes no audit on a refused self-review", async () => {
    const tx = fakeTx(row({ userId: actor.userId }));
    const store = { transaction: vi.fn((work) => work(tx)) };
    await expect(
      createReviewAchievement({ store, authorize })({
        actor,
        achievementId: "a1",
        outcome: "reject",
      })
    ).rejects.toThrow();
    expect(tx.audit).not.toHaveBeenCalled();
  });
});
