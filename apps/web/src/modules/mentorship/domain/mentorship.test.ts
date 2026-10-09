import { describe, expect, it } from "vitest";

import {
  decideRequest,
  decideTransition,
  MENTORSHIP_STATES,
  type MentorshipAction,
  type MentorshipRow,
  type MentorshipState,
} from "./mentorship";

const MENTOR = "m",
  MENTEE = "s",
  STRANGER = "x";
const NOW = new Date("2026-09-22T10:00:00Z");
const ACTIONS: MentorshipAction[] = [
  "accept",
  "decline",
  "cancel",
  "start",
  "complete",
];

const row = (state: MentorshipState): MentorshipRow => ({
  id: "r1",
  mentorId: MENTOR,
  menteeId: MENTEE,
  state,
  topic: null,
  message: "hi",
  responseNote: null,
  requestedAt: new Date("2026-09-01T00:00:00Z"),
  respondedAt:
    state === "REQUESTED" || state === "CANCELLED"
      ? null
      : new Date("2026-09-02T00:00:00Z"),
  startedAt:
    state === "ACTIVE" || state === "COMPLETED"
      ? new Date("2026-09-03T00:00:00Z")
      : null,
  endedAt: ["COMPLETED", "DECLINED", "CANCELLED"].includes(state)
    ? new Date("2026-09-04T00:00:00Z")
    : null,
});

// The oracle, written diagram — deliberately not derived from the implementation's table.
const VALID: Record<
  MentorshipState,
  Partial<Record<MentorshipAction, ("mentor" | "mentee")[]>>
> = {
  REQUESTED: { accept: ["mentor"], decline: ["mentor"], cancel: ["mentee"] },
  ACCEPTED: { start: ["mentor"], cancel: ["mentor", "mentee"] },
  ACTIVE: { complete: ["mentor"], cancel: ["mentor", "mentee"] },
  COMPLETED: {},
  DECLINED: {},
  CANCELLED: {},
};
const TO: Record<MentorshipAction, MentorshipState> = {
  accept: "ACCEPTED",
  decline: "DECLINED",
  cancel: "CANCELLED",
  start: "ACTIVE",
  complete: "COMPLETED",
};
const open = { blocked: false, capacity: { maxMentees: 3, openSlots: 0 } };

function expected(
  state: MentorshipState,
  action: MentorshipAction,
  role: "mentor" | "mentee" | "stranger"
) {
  if (role === "stranger") return "NOT_FOUND";
  if (action !== "cancel" && role === "mentee") return "NOT_MENTORSHIP_MENTOR";
  return VALID[state][action]?.includes(role)
    ? "ok"
    : "INVALID_STATE_TRANSITION";
}

describe("every state × action × actor (no pair is untested)", () => {
  const who = { mentor: MENTOR, mentee: MENTEE, stranger: STRANGER } as const;
  for (const state of MENTORSHIP_STATES) {
    for (const action of ACTIONS) {
      for (const role of ["mentor", "mentee", "stranger"] as const) {
        it(`${state} + ${action} by ${role} → ${expected(state, action, role)}`, () => {
          const result = decideTransition(
            row(state),
            who[role],
            { action },
            open,
            NOW
          );
          const want = expected(state, action, role);
          if (want === "ok") {
            expect(result).toMatchObject({ ok: true, to: TO[action] });
          } else {
            expect(result).toMatchObject({ ok: false, code: want });
          }
        });
      }
    }
  }
});

describe("patches keep the database's timestamp pairing", () => {
  it("accept sets respondedAt; start sets startedAt; terminal sets endedAt; cancel from ACTIVE keeps startedAt", () => {
    const accept = decideTransition(
      row("REQUESTED"),
      MENTOR,
      { action: "accept" },
      open,
      NOW
    );
    expect(accept).toMatchObject({
      ok: true,
      patch: { state: "ACCEPTED", respondedAt: NOW, endedAt: null },
    });
    const start = decideTransition(
      row("ACCEPTED"),
      MENTOR,
      { action: "start" },
      open,
      NOW
    );
    expect(start).toMatchObject({
      ok: true,
      patch: { state: "ACTIVE", startedAt: NOW, endedAt: null },
    });
    const cancel = decideTransition(
      row("ACTIVE"),
      MENTEE,
      { action: "cancel" },
      open,
      NOW
    );
    expect(cancel).toMatchObject({
      ok: true,
      patch: {
        state: "CANCELLED",
        endedAt: NOW,
        startedAt: row("ACTIVE").startedAt,
      },
    });
    const decline = decideTransition(
      row("REQUESTED"),
      MENTOR,
      { action: "decline", note: "Full this term" },
      open,
      NOW
    );
    expect(decline).toMatchObject({
      ok: true,
      patch: {
        state: "DECLINED",
        respondedAt: NOW,
        endedAt: NOW,
        responseNote: "Full this term",
      },
    });
  });
  it("events follow the action", () => {
    expect(
      decideTransition(
        row("REQUESTED"),
        MENTOR,
        { action: "accept" },
        open,
        NOW
      )
    ).toMatchObject({ event: "mentorship.accepted" });
    expect(
      decideTransition(row("ACTIVE"), MENTOR, { action: "complete" }, open, NOW)
    ).toMatchObject({ event: "mentorship.completed" });
  });
});

describe("blocks and capacity", () => {
  it("a block makes accept/start/complete/decline NOT_FOUND but never stops cancel", () => {
    const blocked = { ...open, blocked: true };
    expect(
      decideTransition(
        row("REQUESTED"),
        MENTOR,
        { action: "accept" },
        blocked,
        NOW
      )
    ).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(
      decideTransition(
        row("REQUESTED"),
        MENTOR,
        { action: "decline" },
        blocked,
        NOW
      )
    ).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(
      decideTransition(
        row("ACCEPTED"),
        MENTOR,
        { action: "start" },
        blocked,
        NOW
      )
    ).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(
      decideTransition(
        row("ACTIVE"),
        MENTOR,
        { action: "complete" },
        blocked,
        NOW
      )
    ).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(
      decideTransition(
        row("ACTIVE"),
        MENTEE,
        { action: "cancel" },
        blocked,
        NOW
      )
    ).toMatchObject({ ok: true });
    expect(
      decideTransition(
        row("ACCEPTED"),
        MENTOR,
        { action: "cancel" },
        blocked,
        NOW
      )
    ).toMatchObject({ ok: true });
  });
  it("accept is refused at capacity, allowed one below; lowering max below the count still refuses", () => {
    const at = (openSlots: number, maxMentees: number) => ({
      blocked: false,
      capacity: { maxMentees, openSlots },
    });
    expect(
      decideTransition(
        row("REQUESTED"),
        MENTOR,
        { action: "accept" },
        at(3, 3),
        NOW
      )
    ).toMatchObject({ ok: false, code: "MENTOR_AT_CAPACITY" });
    expect(
      decideTransition(
        row("REQUESTED"),
        MENTOR,
        { action: "accept" },
        at(2, 3),
        NOW
      )
    ).toMatchObject({ ok: true });
    expect(
      decideTransition(
        row("REQUESTED"),
        MENTOR,
        { action: "accept" },
        at(4, 2),
        NOW
      )
    ).toMatchObject({ ok: false, code: "MENTOR_AT_CAPACITY" });
  });
  it("accept without a mentor profile is MENTOR_NOT_AVAILABLE; capacity is not consulted for other actions", () => {
    expect(
      decideTransition(
        row("REQUESTED"),
        MENTOR,
        { action: "accept" },
        { blocked: false, capacity: null },
        NOW
      )
    ).toMatchObject({ ok: false, code: "MENTOR_NOT_AVAILABLE" });
    expect(
      decideTransition(
        row("ACCEPTED"),
        MENTOR,
        { action: "start" },
        { blocked: false, capacity: null },
        NOW
      )
    ).toMatchObject({ ok: true });
  });
});

describe("decideRequest", () => {
  const ctx = { accepting: true, maxMentees: 3, openSlots: 0, listable: true };
  it("allows an active, listable mentor with a free slot", () =>
    expect(decideRequest(ctx)).toEqual({ ok: true }));
  it("no mentor, or not listable to this viewer (private, blocked, hidden), reads as NOT_FOUND", () => {
    expect(decideRequest(null)).toMatchObject({ code: "NOT_FOUND" });
    expect(decideRequest({ ...ctx, listable: false })).toMatchObject({
      code: "NOT_FOUND",
    });
  });
  it("paused is MENTOR_NOT_AVAILABLE; full is MENTOR_AT_CAPACITY", () => {
    expect(decideRequest({ ...ctx, accepting: false })).toMatchObject({
      code: "MENTOR_NOT_AVAILABLE",
    });
    expect(decideRequest({ ...ctx, openSlots: 3 })).toMatchObject({
      code: "MENTOR_AT_CAPACITY",
    });
  });
});
