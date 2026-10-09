/**
 * Pure rules. `NOT_FOUND` means "not yours to know about". Checks run in order: participant, block,
 * role, state, capacity.
 */
export const MENTORSHIP_STATES = [
  "REQUESTED",
  "ACCEPTED",
  "ACTIVE",
  "COMPLETED",
  "DECLINED",
  "CANCELLED",
] as const;
export type MentorshipState = (typeof MENTORSHIP_STATES)[number];
export const OPEN_STATES = [
  "REQUESTED",
  "ACCEPTED",
  "ACTIVE",
] as const satisfies readonly MentorshipState[];
/** States that hold one of the mentor's slots: a request does not, an acceptance does. */
export const SLOT_STATES = [
  "ACCEPTED",
  "ACTIVE",
] as const satisfies readonly MentorshipState[];
export const isOpen = (state: MentorshipState) =>
  (OPEN_STATES as readonly string[]).includes(state);

export type MentorshipAction =
  "accept" | "decline" | "cancel" | "start" | "complete";
export type MentorshipEventType =
  | "mentorship.requested"
  | "mentorship.accepted"
  | "mentorship.declined"
  | "mentorship.cancelled"
  | "mentorship.started"
  | "mentorship.completed";

export type MentorshipRow = {
  id: string;
  mentorId: string;
  menteeId: string;
  state: MentorshipState;
  topic: string | null;
  message: string;
  responseNote: string | null;
  requestedAt: Date;
  respondedAt: Date | null;
  startedAt: Date | null;
  endedAt: Date | null;
};

/** Written whole, so no transition leaves a stale field behind (the DB's pairing CHECKs depend on it). */
export type MentorshipPatch = Pick<
  MentorshipRow,
  "state" | "responseNote" | "respondedAt" | "startedAt" | "endedAt"
>;

/** What the store knows about a prospective mentor, from the requesting student's point of view. */
export type MentorContext = {
  accepting: boolean;
  maxMentees: number;
  openSlots: number;
  listable: boolean;
};

export type Refusal = {
  code:
    | "NOT_FOUND"
    | "NOT_MENTORSHIP_MENTOR"
    | "INVALID_STATE_TRANSITION"
    | "MENTOR_AT_CAPACITY"
    | "MENTOR_NOT_AVAILABLE"
    | "MENTORSHIP_REQUEST_EXISTS";
};
type Decision<T> = ({ ok: true } & T) | ({ ok: false } & Refusal);
const refuse = (code: Refusal["code"]): { ok: false } & Refusal => ({
  ok: false,
  code,
});

const TRANSITIONS: Record<
  MentorshipAction,
  {
    from: readonly MentorshipState[];
    to: MentorshipState;
    event: MentorshipEventType;
  }
> = {
  accept: { from: ["REQUESTED"], to: "ACCEPTED", event: "mentorship.accepted" },
  decline: {
    from: ["REQUESTED"],
    to: "DECLINED",
    event: "mentorship.declined",
  },
  start: { from: ["ACCEPTED"], to: "ACTIVE", event: "mentorship.started" },
  complete: {
    from: ["ACTIVE"],
    to: "COMPLETED",
    event: "mentorship.completed",
  },
  cancel: {
    from: ["REQUESTED", "ACCEPTED", "ACTIVE"],
    to: "CANCELLED",
    event: "mentorship.cancelled",
  },
};
const TERMINAL: readonly MentorshipState[] = [
  "COMPLETED",
  "DECLINED",
  "CANCELLED",
];

/** May this student ask this prospective mentor? `null` = not a mentor at all. */
export function decideRequest(ctx: MentorContext | null): Decision<object> {
  if (!ctx || !ctx.listable) return refuse("NOT_FOUND");
  if (!ctx.accepting) return refuse("MENTOR_NOT_AVAILABLE");
  if (ctx.openSlots >= ctx.maxMentees) return refuse("MENTOR_AT_CAPACITY");
  return { ok: true };
}

export function decideTransition(
  row: MentorshipRow,
  actorId: string,
  input: { action: MentorshipAction; note?: string | null },
  ctx: {
    blocked: boolean;
    capacity: { maxMentees: number; openSlots: number } | null;
  },
  now: Date
): Decision<{
  patch: MentorshipPatch;
  event: MentorshipEventType;
  to: MentorshipState;
}> {
  const { action } = input;
  const isMentor = actorId === row.mentorId;
  if (!isMentor && actorId !== row.menteeId) return refuse("NOT_FOUND");
  // A block ends every move except leaving: nobody is trapped in a mentorship they cannot escape.
  if (action !== "cancel" && ctx.blocked) return refuse("NOT_FOUND");
  if (action !== "cancel" && !isMentor) return refuse("NOT_MENTORSHIP_MENTOR");

  const t = TRANSITIONS[action];
  if (!t.from.includes(row.state)) return refuse("INVALID_STATE_TRANSITION");
  // A mentor leaves a request by declining it; cancelling a REQUESTED row is the mentee's move.
  if (action === "cancel" && isMentor && row.state === "REQUESTED") {
    return refuse("INVALID_STATE_TRANSITION");
  }
  if (action === "accept") {
    if (!ctx.capacity) return refuse("MENTOR_NOT_AVAILABLE");
    if (ctx.capacity.openSlots >= ctx.capacity.maxMentees)
      return refuse("MENTOR_AT_CAPACITY");
  }

  return {
    ok: true,
    to: t.to,
    event: t.event,
    patch: {
      state: t.to,
      responseNote:
        action === "decline" ? (input.note ?? null) : row.responseNote,
      respondedAt:
        action === "accept" || action === "decline" ? now : row.respondedAt,
      startedAt: action === "start" ? now : row.startedAt,
      endedAt: TERMINAL.includes(t.to) ? now : null,
    },
  };
}
