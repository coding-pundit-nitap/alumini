import { describe, expect, it } from "vitest";

import {
  ACHIEVEMENT_STATES,
  achievementInput,
  decideTransition,
  type AchievementState,
  type Refusal,
} from "./achievement";

const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const row = (status: AchievementState) => ({ id: "a1", userId: OWNER, status });

describe("achievement state machine", () => {
  it("withdraw: only the owner, only while SUBMITTED, is terminal", () => {
    for (const status of ACHIEVEMENT_STATES) {
      const asOwner = decideTransition(
        row(status),
        OWNER,
        { action: "withdraw" },
        false
      );
      if (status === "SUBMITTED") {
        expect(asOwner).toEqual({
          ok: true,
          to: "WITHDRAWN",
          event: "achievement.withdrawn",
          patch: { status: "WITHDRAWN" },
        });
      } else {
        expect(asOwner).toEqual({
          ok: false,
          code: "INVALID_STATE_TRANSITION",
        });
      }
      const asOther = decideTransition(
        row(status),
        OTHER,
        { action: "withdraw" },
        false
      );
      expect(asOther).toEqual({ ok: false, code: "NOT_OWNER" });
    }
  });

  it("review approve: reviewer only, from SUBMITTED or UNDER_REVIEW, goes straight to PUBLISHED", () => {
    for (const status of ["SUBMITTED", "UNDER_REVIEW"] as const) {
      expect(
        decideTransition(
          row(status),
          OTHER,
          { action: "review", outcome: "approve" },
          true
        )
      ).toEqual({
        ok: true,
        to: "PUBLISHED",
        event: "achievement.approved",
        patch: { status: "PUBLISHED" },
      });
    }
    for (const status of [
      "APPROVED",
      "PUBLISHED",
      "REJECTED",
      "WITHDRAWN",
    ] as const) {
      expect(
        decideTransition(
          row(status),
          OTHER,
          { action: "review", outcome: "approve" },
          true
        )
      ).toEqual({ ok: false, code: "INVALID_STATE_TRANSITION" });
    }
  });

  it("review reject: reviewer only, from SUBMITTED or UNDER_REVIEW, is terminal", () => {
    for (const status of ["SUBMITTED", "UNDER_REVIEW"] as const) {
      expect(
        decideTransition(
          row(status),
          OTHER,
          { action: "review", outcome: "reject" },
          true
        )
      ).toEqual({
        ok: true,
        to: "REJECTED",
        event: "achievement.rejected",
        patch: { status: "REJECTED" },
      });
    }
  });

  it("review is refused for a non-reviewer regardless of state", () => {
    for (const status of ACHIEVEMENT_STATES) {
      expect(
        decideTransition(
          row(status),
          OTHER,
          { action: "review", outcome: "approve" },
          false
        )
      ).toEqual({ ok: false, code: "NOT_REVIEWER" });
    }
  });

  it("self-review is forbidden even for a reviewer who is also the owner", () => {
    expect(
      decideTransition(
        row("SUBMITTED"),
        OWNER,
        { action: "review", outcome: "approve" },
        true
      )
    ).toEqual({ ok: false, code: "SELF_REVIEW_FORBIDDEN" });
  });

  it("self-review check runs before reviewer-role check (owner non-reviewer tries to review)", () => {
    // Even without reviewer role, owner gets SELF_REVIEW_FORBIDDEN not NOT_REVIEWER
    expect(
      decideTransition(
        row("SUBMITTED"),
        OWNER,
        { action: "review", outcome: "approve" },
        false
      )
    ).toEqual({ ok: false, code: "SELF_REVIEW_FORBIDDEN" });
  });

  it("every (state, actor, action, outcome, isReviewer) combo produces valid result (60 cases)", () => {
    const outcomes: Array<"approve" | "reject"> = ["approve", "reject"];
    const cases: Array<{
      status: AchievementState;
      actorRole: "owner" | "other";
      action: "withdraw" | "review";
      outcome?: "approve" | "reject";
      isReviewer: boolean;
      expectedOk: boolean;
      expectedCode?: Refusal["code"];
      expectedTo?: AchievementState;
    }> = [];

    for (const status of ACHIEVEMENT_STATES) {
      for (const actorRole of ["owner", "other"] as const) {
        cases.push({
          status,
          actorRole,
          action: "withdraw",
          isReviewer: false,
          expectedOk: actorRole === "owner" && status === "SUBMITTED",
          expectedCode:
            actorRole === "owner" && status === "SUBMITTED"
              ? undefined
              : actorRole === "owner"
                ? "INVALID_STATE_TRANSITION"
                : "NOT_OWNER",
          expectedTo:
            actorRole === "owner" && status === "SUBMITTED"
              ? "WITHDRAWN"
              : undefined,
        });

        for (const outcome of outcomes) {
          for (const isReviewer of [true, false]) {
            let expectedOk: boolean;
            let expectedCode: Refusal["code"] | undefined;
            let expectedTo: AchievementState | undefined;

            if (actorRole === "owner") {
              // Owner cannot review their own achievement
              expectedOk = false;
              expectedCode = "SELF_REVIEW_FORBIDDEN";
            } else if (!isReviewer) {
              // Non-reviewer cannot review
              expectedOk = false;
              expectedCode = "NOT_REVIEWER";
            } else if (!["SUBMITTED", "UNDER_REVIEW"].includes(status)) {
              // Can only review from SUBMITTED or UNDER_REVIEW
              expectedOk = false;
              expectedCode = "INVALID_STATE_TRANSITION";
            } else {
              expectedOk = true;
              expectedTo = outcome === "approve" ? "PUBLISHED" : "REJECTED";
            }

            cases.push({
              status,
              actorRole,
              action: "review",
              outcome,
              isReviewer,
              expectedOk,
              expectedCode,
              expectedTo,
            });
          }
        }
      }
    }

    for (const testCase of cases) {
      const actorId = testCase.actorRole === "owner" ? OWNER : OTHER;
      const result = decideTransition(
        row(testCase.status),
        actorId,
        {
          action: testCase.action,
          outcome: testCase.outcome,
        },
        testCase.isReviewer
      );

      expect(result.ok).toBe(testCase.expectedOk);

      if (testCase.expectedOk) {
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.to).toBe(testCase.expectedTo);
          expect(result.patch.status).toBe(testCase.expectedTo);
          if (testCase.action === "withdraw") {
            expect(result.event).toBe("achievement.withdrawn");
          } else if (testCase.outcome === "approve") {
            expect(result.event).toBe("achievement.approved");
          } else {
            expect(result.event).toBe("achievement.rejected");
          }
        }
      } else {
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe(testCase.expectedCode);
        }
      }
    }

    expect(cases.length).toBe(ACHIEVEMENT_STATES.length * 2 * (1 + 2 * 2));
  });
});

describe("achievementInput", () => {
  const valid = { title: "t", description: "d", category: "AWARD" };

  it("accepts a well-formed submission", () => {
    expect(achievementInput.safeParse(valid).success).toBe(true);
  });

  it("rejects an empty title, an empty description, and an unknown category", () => {
    expect(achievementInput.safeParse({ ...valid, title: "" }).success).toBe(
      false
    );
    expect(
      achievementInput.safeParse({ ...valid, description: "" }).success
    ).toBe(false);
    expect(
      achievementInput.safeParse({ ...valid, category: "NOT_A_CATEGORY" })
        .success
    ).toBe(false);
  });

  it("rejects a title over 200 chars, a description over 5000 chars, and unknown fields (strict)", () => {
    expect(
      achievementInput.safeParse({ ...valid, title: "x".repeat(201) }).success
    ).toBe(false);
    expect(
      achievementInput.safeParse({ ...valid, description: "x".repeat(5001) })
        .success
    ).toBe(false);
    expect(
      achievementInput.safeParse({ ...valid, extra: "nope" }).success
    ).toBe(false);
  });
});
