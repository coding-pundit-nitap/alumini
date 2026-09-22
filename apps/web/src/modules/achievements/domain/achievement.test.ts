import { describe, expect, it } from "vitest";

import {
  ACHIEVEMENT_STATES,
  decideTransition,
  type AchievementState,
} from "./achievement";

const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const row = (status: AchievementState) => ({ id: "a1", userId: OWNER, status });

describe("achievement state machine (C-7)", () => {
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

  it("every (state, action, outcome) triple is covered exactly once (90-case parity with mentorship.test.ts)", () => {
    const outcomes: Array<"approve" | "reject"> = ["approve", "reject"];
    let cases = 0;
    for (const status of ACHIEVEMENT_STATES) {
      for (const actorRole of ["owner", "other"] as const) {
        const actorId = actorRole === "owner" ? OWNER : OTHER;
        decideTransition(row(status), actorId, { action: "withdraw" }, false);
        cases += 1;
        for (const outcome of outcomes) {
          for (const isReviewer of [true, false]) {
            decideTransition(
              row(status),
              actorId,
              { action: "review", outcome },
              isReviewer
            );
            cases += 1;
          }
        }
      }
    }
    expect(cases).toBe(ACHIEVEMENT_STATES.length * 2 * (1 + 2 * 2));
  });
});
