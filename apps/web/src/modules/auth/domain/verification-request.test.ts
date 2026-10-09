import { describe, expect, it } from "vitest";

import type { EmailPolicy } from "./email-policy";
import {
  groupHistory,
  MAX_REJECTED_SUBMISSIONS,
  normaliseNote,
  noteProblem,
  REVIEW_NOTE_MAX,
  submissionBlock,
  verificationTrack,
} from "./verification-request";

const policy: EmailPolicy = new Map([
  ["inst.test", { role: "STUDENT", autoVerify: true }],
  ["staff.inst.test", { role: "STAFF", autoVerify: false }],
]);

describe("verificationTrack", () => {
  it("sends an external address down the evidence track", () => {
    expect(verificationTrack("a@gmail.test", policy)).toBe("EVIDENCE");
  });

  it("sends a recognised auto-verify domain down the evidence track too (it is PENDING for another reason)", () => {
    expect(verificationTrack("a@inst.test", policy)).toBe("EVIDENCE");
  });

  it("holds a recognised domain that needs institute confirmation for staff confirmation", () => {
    expect(verificationTrack("a@staff.inst.test", policy)).toBe(
      "AWAITING_STAFF_CONFIRMATION"
    );
  });
});

describe("submissionBlock", () => {
  const ok = {
    accountState: "PENDING",
    track: "EVIDENCE" as const,
    hasOpenRequest: false,
    rejectedCount: 0,
  };

  it("lets an eligible account submit", () => {
    expect(submissionBlock(ok)).toBeNull();
  });

  it("lets a REJECTED account submit again", () => {
    expect(
      submissionBlock({ ...ok, accountState: "REJECTED", rejectedCount: 2 })
    ).toBeNull();
  });

  it.each(["VERIFIED", "SUSPENDED", "DEACTIVATED"])(
    "blocks a %s account",
    (accountState) => {
      expect(submissionBlock({ ...ok, accountState })).toBe(
        "NOT_ELIGIBLE_STATE"
      );
    }
  );

  it("blocks the staff track", () => {
    expect(
      submissionBlock({ ...ok, track: "AWAITING_STAFF_CONFIRMATION" })
    ).toBe("STAFF_TRACK");
  });

  it("blocks a second open request", () => {
    expect(submissionBlock({ ...ok, hasOpenRequest: true })).toBe(
      "REQUEST_OPEN"
    );
  });

  it("locks an account at the rejection threshold, not before", () => {
    expect(
      submissionBlock({ ...ok, rejectedCount: MAX_REJECTED_SUBMISSIONS - 1 })
    ).toBeNull();
    expect(
      submissionBlock({ ...ok, rejectedCount: MAX_REJECTED_SUBMISSIONS })
    ).toBe("LOCKED");
  });

  it("reports the state before anything else", () => {
    expect(
      submissionBlock({
        accountState: "SUSPENDED",
        track: "AWAITING_STAFF_CONFIRMATION",
        hasOpenRequest: true,
        rejectedCount: 99,
      })
    ).toBe("NOT_ELIGIBLE_STATE");
  });
});

describe("review notes", () => {
  it("trims, and treats blank as no note", () => {
    expect(normaliseNote("  Roll number not found.  ")).toBe(
      "Roll number not found."
    );
    expect(normaliseNote("   ")).toBeNull();
    expect(normaliseNote(null)).toBeNull();
    expect(normaliseNote(undefined)).toBeNull();
  });

  it("requires a note to reject", () => {
    expect(noteProblem("REJECTED", null)).toMatch(/required/i);
    expect(noteProblem("REJECTED", "Not found.")).toBeNull();
  });

  it("does not require a note to approve", () => {
    expect(noteProblem("APPROVED", null)).toBeNull();
  });

  it("caps the length whatever the decision", () => {
    const long = "x".repeat(REVIEW_NOTE_MAX + 1);
    expect(noteProblem("APPROVED", long)).toMatch(/at most/i);
    expect(noteProblem("REJECTED", long)).toMatch(/at most/i);
  });
});

describe("groupHistory", () => {
  const entry = (userId: string, n: number) => ({
    userId,
    status: "REJECTED" as const,
    decidedAt: new Date(Date.UTC(2026, 0, n)),
    note: `n${n}`,
  });
  it("groups per user, keeps order, caps at the limit, drops userId", () => {
    const rows = [6, 5, 4, 3, 2, 1]
      .map((n) => entry("a", n))
      .concat([entry("b", 9)]);
    const map = groupHistory(rows);
    expect(map.get("a")!.map((h) => h.note)).toEqual([
      "n6",
      "n5",
      "n4",
      "n3",
      "n2",
    ]);
    expect(map.get("b")).toEqual([
      {
        status: "REJECTED",
        decidedAt: new Date(Date.UTC(2026, 0, 9)),
        note: "n9",
      },
    ]);
    expect(map.get("c")).toBeUndefined();
  });
});
