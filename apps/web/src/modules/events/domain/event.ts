/**
 * Pure rules. Admission and seat release are decided by guarded SQL; these
 * functions only explain a miss.
 */
export const EVENT_STATUSES = ["SCHEDULED", "CANCELLED"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const REGISTRATION_STATES = [
  "REGISTERED",
  "CANCELLED",
  "ATTENDED",
  "NO_SHOW",
] as const;
export type RegistrationState = (typeof REGISTRATION_STATES)[number];

export type RefusalCode =
  | "NOT_FOUND"
  | "EVENT_CANCELLED"
  | "EVENT_FULL"
  | "REGISTRATION_CLOSED"
  | "ALREADY_REGISTERED"
  | "INVALID_STATE_TRANSITION"
  | "PERMISSION_DENIED";

export type Refusal = { ok: false; code: RefusalCode };

export type EventFacts = {
  status: EventStatus;
  startsAt: Date;
  registrationDeadline: Date;
  capacity: number;
  registeredCount: number;
  organizerId: string;
};

export type EventActor = { userId: string; canManageAny: boolean };

const refuse = (code: RefusalCode): Refusal => ({ ok: false, code });
const canManage = (event: EventFacts, actor: EventActor) =>
  actor.userId === event.organizerId || actor.canManageAny;

/**
 * Explains why the registration update missed, in order: not found, cancelled,
 * already registered, deadline, capacity.
 */
export function classifyRegistrationRefusal(
  event: EventFacts | null,
  own: RegistrationState | null,
  now: Date
): Refusal {
  if (!event) return refuse("NOT_FOUND");
  if (event.status === "CANCELLED") return refuse("EVENT_CANCELLED");
  if (own === "REGISTERED" || own === "ATTENDED" || own === "NO_SHOW") {
    return refuse("ALREADY_REGISTERED");
  }
  if (now >= event.registrationDeadline) return refuse("REGISTRATION_CLOSED");
  return refuse("EVENT_FULL");
}

/**
 * May this actor cancel this event? The organizer or an `event.manage` holder,
 * while scheduled.
 */
export function decideCancelEvent(
  event: EventFacts | null,
  actor: EventActor
): { ok: true } | Refusal {
  if (!event) return refuse("NOT_FOUND");
  if (!canManage(event, actor)) return refuse("PERMISSION_DENIED");
  if (event.status === "CANCELLED") return refuse("INVALID_STATE_TRANSITION");
  return { ok: true };
}

export function decideCancelRegistration(
  event: EventFacts | null,
  own: RegistrationState | null,
  now: Date
): Refusal {
  if (!event) return refuse("NOT_FOUND");
  if (event.status === "CANCELLED") return refuse("EVENT_CANCELLED");
  if (now >= event.startsAt) return refuse("REGISTRATION_CLOSED");
  if (own === null || own === "CANCELLED") return refuse("NOT_FOUND");
  return refuse("INVALID_STATE_TRANSITION");
}

/**
 * May this actor mark attendance on this registration? Organizer or
 * `event.manage`, after start.
 */
export function decideAttendance(
  event: EventFacts | null,
  current: RegistrationState | null,
  actor: EventActor,
  now: Date
): { ok: true } | Refusal {
  if (!event) return refuse("NOT_FOUND");
  if (!canManage(event, actor)) return refuse("PERMISSION_DENIED");
  if (event.status === "CANCELLED") return refuse("EVENT_CANCELLED");
  if (now < event.startsAt) return refuse("INVALID_STATE_TRANSITION");
  if (current === null) return refuse("NOT_FOUND");
  if (current === "CANCELLED") return refuse("INVALID_STATE_TRANSITION");
  return { ok: true };
}
