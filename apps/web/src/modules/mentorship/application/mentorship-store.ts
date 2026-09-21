import type {
  MentorContext,
  MentorshipEventType,
  MentorshipPatch,
  MentorshipRow,
  MentorshipState,
} from "../domain/mentorship";

/** The `mentorship.*` events the outbox carries (contracts in `@nitap/jobs`). Ids only. */
export type MentorshipEvent = {
  type: MentorshipEventType;
  payload: {
    v: 1;
    mentorshipId: string;
    mentorId: string;
    menteeId: string;
    actorId: string;
  };
};

export type NewMentorship = {
  mentorId: string;
  menteeId: string;
  topic: string | null;
  message: string;
  requestedAt: Date;
};

/**
 * Everything a write does happens through one of these, inside ONE database transaction, so a row and its
 * outbox event commit or roll back together (NFR-REL-002).
 */
export type MentorshipTx = {
  findById(id: string): Promise<MentorshipRow | null>;
  /** What the store knows about this prospective mentor, from this student's point of view. */
  mentorContext(
    mentorId: string,
    menteeId: string
  ): Promise<MentorContext | null>;
  /** Guarded slot count for a transition that needs the mentor's capacity. Null without a mentor profile. */
  lockMentorCapacity(
    mentorId: string
  ): Promise<{ maxMentees: number; openSlots: number } | null>;
  /** Either direction. */
  blocked(a: string, b: string): Promise<boolean>;
  /** Inserts the request; null when an open pair already exists (a concurrent request won). Never throws for that. */
  insert(input: NewMentorship): Promise<MentorshipRow | null>;
  /** Guarded: only a row still in `from` moves. Null when it had already changed (or is gone). */
  update(
    id: string,
    from: MentorshipState,
    patch: MentorshipPatch
  ): Promise<MentorshipRow | null>;
  enqueue(event: MentorshipEvent): Promise<void>;
};

export type MentorshipStore = {
  transaction<T>(work: (tx: MentorshipTx) => Promise<T>): Promise<T>;
};

/** One committed outcome, for logs and metrics. Called after the transaction, never inside it. */
export type MentorshipOutcome =
  "requested" | "accepted" | "declined" | "cancelled" | "started" | "completed";
export type MentorshipObserver = (
  outcome: MentorshipOutcome,
  mentorshipId: string
) => void;
