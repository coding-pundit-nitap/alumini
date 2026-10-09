import type { Permission } from "@nitap/database/permissions";
import type { PayloadOf } from "@nitap/jobs";
import type { eventJobs } from "@nitap/jobs";

import type { Actor } from "@/modules/auth";

import type {
  EventFacts,
  RefusalCode,
  RegistrationState,
} from "../domain/event";

/** The auth module's `authorize`, injected by the composition root. */
export type Authorize = (actor: Actor | null, permission: Permission) => Actor;

export type RateLimiter = {
  consume(
    key: string,
    rule: { max: number; window: number }
  ): Promise<{ allowed: boolean; retryAfter: number | null }>;
};

export type NewEvent = {
  organizerId: string;
  title: string;
  description: string;
  startsAt: Date;
  timezone: string;
  location: string | null;
  isOnline: boolean;
  capacity: number;
  registrationDeadline: Date;
};

/**
 * The `event.*` outbox events (contracts in `@nitap/jobs`). Names use hyphens,
 * not underscores.
 */
export type EventOutboxEvent = {
  [K in keyof typeof eventJobs]: {
    type: K;
    payload: PayloadOf<(typeof eventJobs)[K]>;
  };
}[keyof typeof eventJobs];

/**
 * All writes go through one transaction. `claimSeat`, `releaseSeat` and
 * `cancelEvent` are single guarded updates that report whether their guard
 * matched.
 */
export type EventTx = {
  insertEvent(input: NewEvent): Promise<{ id: string }>;
  /**
   * Guarded increment (statement 1): scheduled, before the deadline, under
   * capacity.
   */
  claimSeat(eventId: string): Promise<boolean>;
  /**
   * Statement 2: inserts a new registration, or reuses a CANCELLED row. Null
   * for an existing REGISTERED row.
   */
  upsertRegistration(
    eventId: string,
    userId: string
  ): Promise<{ id: string } | null>;
  /** Guarded decrement (statement 1): scheduled, before the start. */
  releaseSeat(eventId: string): Promise<boolean>;
  cancelRegistration(
    eventId: string,
    userId: string
  ): Promise<{ id: string } | null>;
  markAttendance(
    eventId: string,
    registrationId: string,
    state: "ATTENDED" | "NO_SHOW"
  ): Promise<{ id: string; userId: string } | null>;
  /** Guarded SCHEDULED → CANCELLED. */
  cancelEvent(eventId: string): Promise<boolean>;
  findEvent(eventId: string): Promise<EventFacts | null>;
  findRegistration(
    eventId: string,
    by: { userId: string } | { registrationId: string }
  ): Promise<{ id: string; userId: string; state: RegistrationState } | null>;
  enqueue(event: EventOutboxEvent): Promise<void>;
};

export type EventStore = {
  transaction<T>(work: (tx: EventTx) => Promise<T>): Promise<T>;
};

/**
 * One committed outcome, for logs and metrics. Called after the transaction,
 * never inside it.
 */
export type EventOutcome =
  | "created"
  | "cancelled"
  | "registered"
  | "registration_cancelled"
  | "attendance_marked";
export type EventObserver = (outcome: EventOutcome, eventId: string) => void;

/** A refusal that never reached a commit. Called after the transaction. */
export type RefusalObserver = (code: RefusalCode) => void;
