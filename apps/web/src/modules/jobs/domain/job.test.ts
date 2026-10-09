import { describe, expect, it } from "vitest";

import {
  decideApprove,
  decideClose,
  decideCreate,
  decideEdit,
  decideReject,
  JOB_STATES,
  TERMINAL_STATES,
  type JobRow,
  type JobStatus,
} from "./job";

const NOW = new Date("2026-09-23T10:00:00Z");
const POSTER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

const row = (status: JobStatus, over: Partial<JobRow> = {}): JobRow => ({
  id: "job-1",
  postedBy: POSTER,
  title: "Backend Engineer",
  company: "Acme",
  description: "Build things",
  employmentType: "FULL_TIME",
  location: "Remote",
  workMode: "REMOTE",
  experience: "2+ years",
  skills: ["node"],
  applicationUrl: "https://acme.example/apply",
  deadline: new Date("2026-12-01"),
  status,
  reviewedBy: null,
  reviewedAt: null,
  reviewNote: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

describe("decideCreate", () => {
  it("without job.approve, creates PENDING_REVIEW and emits job.submitted", () => {
    const d = decideCreate(false);
    expect(d).toMatchObject({
      ok: true,
      status: "PENDING_REVIEW",
      directPublish: false,
      event: "job.submitted",
    });
  });
  it("with job.approve, creates PUBLISHED directly and emits job.published (audited as publish_direct)", () => {
    const d = decideCreate(true);
    expect(d).toMatchObject({
      ok: true,
      status: "PUBLISHED",
      directPublish: true,
      event: "job.published",
    });
  });
});

describe("decideEdit", () => {
  it("refuses a non-owner without job.manage: NOT_OWNER", () => {
    const d = decideEdit(row("PENDING_REVIEW"), false, false);
    expect(d).toMatchObject({ ok: false, code: "NOT_OWNER" });
  });
  it("editing PENDING_REVIEW never changes status, no event", () => {
    const d = decideEdit(row("PENDING_REVIEW"), true, true);
    expect(d).toMatchObject({
      ok: true,
      patch: { status: "PENDING_REVIEW" },
      event: null,
    });
  });
  it("a non-material change on PUBLISHED stays PUBLISHED, no event", () => {
    const d = decideEdit(
      row("PUBLISHED", { reviewedBy: OTHER, reviewedAt: NOW }),
      false,
      true
    );
    expect(d).toMatchObject({
      ok: true,
      patch: { status: "PUBLISHED", reviewedBy: OTHER, reviewedAt: NOW },
      event: null,
    });
  });
  it("a material change on PUBLISHED reverts to PENDING_REVIEW, clears review fields, emits job.submitted", () => {
    const d = decideEdit(
      row("PUBLISHED", { reviewedBy: OTHER, reviewedAt: NOW }),
      true,
      true
    );
    expect(d).toMatchObject({
      ok: true,
      patch: {
        status: "PENDING_REVIEW",
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
      },
      event: "job.submitted",
    });
  });
  it("editing REJECTED (any field, twice in a row) resubmits and clears review_note each time", () => {
    const rejected = row("REJECTED", {
      reviewedBy: OTHER,
      reviewedAt: NOW,
      reviewNote: "Add a salary range",
    });
    const first = decideEdit(rejected, false, true);
    expect(first).toMatchObject({
      ok: true,
      patch: { status: "PENDING_REVIEW", reviewNote: null },
      event: "job.submitted",
    });
    const rejectedAgain = row("REJECTED", {
      reviewedBy: OTHER,
      reviewedAt: NOW,
      reviewNote: "Still missing it",
    });
    const second = decideEdit(rejectedAgain, false, true);
    expect(second).toMatchObject({
      ok: true,
      patch: { reviewNote: null },
      event: "job.submitted",
    });
  });
  it.each(["EXPIRED", "CLOSED"] as const)(
    "refuses editing a terminal %s job",
    (status) => {
      expect(decideEdit(row(status), false, true)).toMatchObject({
        ok: false,
        code: "INVALID_STATE_TRANSITION",
      });
    }
  );
});

describe("decideApprove", () => {
  it("refuses the poster reviewing their own job, even though they hold job.approve", () => {
    expect(decideApprove(row("PENDING_REVIEW"), POSTER, NOW)).toMatchObject({
      ok: false,
      code: "SELF_REVIEW_FORBIDDEN",
    });
  });
  it("approves PENDING_REVIEW, stamps reviewedBy/reviewedAt, clears reviewNote", () => {
    expect(decideApprove(row("PENDING_REVIEW"), OTHER, NOW)).toMatchObject({
      ok: true,
      patch: {
        status: "PUBLISHED",
        reviewedBy: OTHER,
        reviewedAt: NOW,
        reviewNote: null,
      },
    });
  });
  it.each(JOB_STATES.filter((s) => s !== "PENDING_REVIEW"))(
    "refuses approving from %s",
    (status) => {
      expect(decideApprove(row(status), OTHER, NOW)).toMatchObject({
        ok: false,
        code: "INVALID_STATE_TRANSITION",
      });
    }
  );
});

describe("decideReject", () => {
  it("refuses the poster reviewing their own job", () => {
    expect(
      decideReject(row("PENDING_REVIEW"), POSTER, "needs work", NOW)
    ).toMatchObject({
      ok: false,
      code: "SELF_REVIEW_FORBIDDEN",
    });
  });
  it.each([undefined, null, "", "   "])(
    "requires a non-empty note (%j)",
    (note) => {
      expect(
        decideReject(row("PENDING_REVIEW"), OTHER, note, NOW)
      ).toMatchObject({
        ok: false,
        code: "REVIEW_NOTE_REQUIRED",
      });
    }
  );
  it("rejects PENDING_REVIEW, stamps reviewedBy/reviewedAt/reviewNote (trimmed)", () => {
    expect(
      decideReject(row("PENDING_REVIEW"), OTHER, "  Add a salary range  ", NOW)
    ).toMatchObject({
      ok: true,
      patch: {
        status: "REJECTED",
        reviewedBy: OTHER,
        reviewedAt: NOW,
        reviewNote: "Add a salary range",
      },
    });
  });
  it.each(JOB_STATES.filter((s) => s !== "PENDING_REVIEW"))(
    "refuses rejecting from %s",
    (status) => {
      expect(decideReject(row(status), OTHER, "note", NOW)).toMatchObject({
        ok: false,
        code: "INVALID_STATE_TRANSITION",
      });
    }
  );
});

describe("decideClose", () => {
  it("refuses a non-owner without job.manage: NOT_OWNER", () => {
    expect(decideClose(row("PUBLISHED"), false)).toMatchObject({
      ok: false,
      code: "NOT_OWNER",
    });
  });
  it.each(["PENDING_REVIEW", "PUBLISHED"] as const)(
    "closes from %s",
    (status) => {
      expect(decideClose(row(status), true)).toMatchObject({
        ok: true,
        patch: { status: "CLOSED" },
      });
    }
  );
  it.each(["REJECTED", "EXPIRED", "CLOSED"] as const)(
    "refuses closing from terminal-ish %s",
    (status) => {
      // REJECTED is non-terminal but is not a close-eligible state either (only PENDING_REVIEW/PUBLISHED are).
      expect(decideClose(row(status), true)).toMatchObject({
        ok: false,
        code: "INVALID_STATE_TRANSITION",
      });
    }
  );
});

describe("state sets", () => {
  it("REJECTED is not terminal", () => {
    expect(TERMINAL_STATES).not.toContain("REJECTED");
  });
  it("EXPIRED and CLOSED are the only terminal states", () => {
    expect([...TERMINAL_STATES].sort()).toEqual(["CLOSED", "EXPIRED"]);
  });
});
