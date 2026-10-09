import type { ListCursor } from "../domain/cursor";
import type { EventStatus, RegistrationState } from "../domain/event";

/**
 * API shape. `spotsRemaining` and `canManage` are computed by the use cases,
 * never stored.
 */
export type EventSummary = {
  id: string;
  title: string;
  startsAt: Date;
  timezone: string;
  location: string | null;
  isOnline: boolean;
  capacity: number;
  registeredCount: number;
  spotsRemaining: number;
  registrationDeadline: Date;
  status: EventStatus;
  organizer: { id: string; name: string };
  viewer: { registrationState: RegistrationState | null };
};

export type EventDetail = EventSummary & {
  description: string;
  canManage: boolean;
};

/**
 * What the read port returns: everything above minus the fields the use cases
 * derive.
 */
export type EventSummaryRow = Omit<EventSummary, "spotsRemaining">;
export type EventDetailRow = EventSummaryRow & { description: string };

export type EventListFilter = {
  scope: "upcoming" | "mine" | "past";
  includeCancelled: boolean;
  limit: number;
  after?: ListCursor;
};

/** One row of `listRegistrants`. */
export type Registrant = {
  registrationId: string;
  userId: string;
  name: string;
  state: RegistrationState;
  registeredAt: Date;
};

export type RegistrantFilter = {
  limit: number;
  after?: ListCursor;
};

export type EventQueries = {
  list(viewerId: string, filter: EventListFilter): Promise<EventSummaryRow[]>;
  get(viewerId: string, eventId: string): Promise<EventDetailRow | null>;
  /** Keyset by `(registered_at, id)` ascending. */
  listRegistrants(
    eventId: string,
    filter: RegistrantFilter
  ): Promise<Registrant[]>;
};
