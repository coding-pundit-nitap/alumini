import { randomUUID } from "node:crypto";

import type {
  EventOutboxEvent,
  EventStore,
  EventTx,
  NewEvent,
} from "@/modules/events/application/ports";
import type {
  EventFacts,
  RegistrationState,
} from "@/modules/events/domain/event";

type EventRow = EventFacts & { id: string };
type RegistrationRow = {
  id: string;
  eventId: string;
  userId: string;
  state: RegistrationState;
};

export type FakeEventStoreOptions = {
  /**
   * The clock the guarded statements compare against; real time by default so
   * it agrees with Prisma's `now()`.
   */
  now?: () => Date;
  failEnqueue?: boolean;
};

/** A throwing transaction restores the previous state, including the outbox. */
export function createFakeEventStore(options: FakeEventStoreOptions = {}) {
  const now = options.now ?? (() => new Date());
  let state = {
    events: new Map<string, EventRow>(),
    registrations: new Map<string, RegistrationRow>(),
    outbox: [] as EventOutboxEvent[],
  };
  const users = new Set<string>();

  const registrationFor = (eventId: string, userId: string) =>
    [...state.registrations.values()].find(
      (r) => r.eventId === eventId && r.userId === userId
    ) ?? null;

  const tx: EventTx = {
    async insertEvent(input: NewEvent) {
      const id = randomUUID();
      state.events.set(id, {
        id,
        organizerId: input.organizerId,
        status: "SCHEDULED",
        startsAt: input.startsAt,
        registrationDeadline: input.registrationDeadline,
        capacity: input.capacity,
        registeredCount: 0,
      });
      return { id };
    },

    async claimSeat(eventId) {
      const event = state.events.get(eventId);
      if (!event) return false;
      if (event.status !== "SCHEDULED") return false;
      if (now() >= event.registrationDeadline) return false;
      if (event.registeredCount >= event.capacity) return false;
      event.registeredCount += 1;
      return true;
    },

    async upsertRegistration(eventId, userId) {
      const existing = registrationFor(eventId, userId);
      if (existing) {
        if (existing.state !== "CANCELLED") return null;
        existing.state = "REGISTERED";
        return { id: existing.id };
      }
      const row: RegistrationRow = {
        id: randomUUID(),
        eventId,
        userId,
        state: "REGISTERED",
      };
      state.registrations.set(row.id, row);
      return { id: row.id };
    },

    async releaseSeat(eventId) {
      const event = state.events.get(eventId);
      if (!event) return false;
      if (event.status !== "SCHEDULED") return false;
      if (now() >= event.startsAt) return false;
      if (event.registeredCount <= 0) return false;
      event.registeredCount -= 1;
      return true;
    },

    async cancelRegistration(eventId, userId) {
      const row = registrationFor(eventId, userId);
      if (!row || row.state !== "REGISTERED") return null;
      row.state = "CANCELLED";
      return { id: row.id };
    },

    async markAttendance(eventId, registrationId, nextState) {
      const row = state.registrations.get(registrationId);
      if (!row || row.eventId !== eventId) return null;
      if (
        row.state !== "REGISTERED" &&
        row.state !== "ATTENDED" &&
        row.state !== "NO_SHOW"
      ) {
        return null;
      }
      row.state = nextState;
      return { id: row.id, userId: row.userId };
    },

    async cancelEvent(eventId) {
      const event = state.events.get(eventId);
      if (!event || event.status !== "SCHEDULED") return false;
      event.status = "CANCELLED";
      return true;
    },

    async findEvent(eventId) {
      const event = state.events.get(eventId);
      if (!event) return null;
      return {
        status: event.status,
        startsAt: event.startsAt,
        registrationDeadline: event.registrationDeadline,
        capacity: event.capacity,
        registeredCount: event.registeredCount,
        organizerId: event.organizerId,
      };
    },

    async findRegistration(eventId, by) {
      const row =
        "userId" in by
          ? registrationFor(eventId, by.userId)
          : (state.registrations.get(by.registrationId) ?? null);
      if (!row || row.eventId !== eventId) return null;
      return { id: row.id, userId: row.userId, state: row.state };
    },

    async enqueue(event) {
      if (options.failEnqueue) throw new Error("outbox down");
      state.outbox.push(event);
    },
  };

  const store: EventStore = {
    async transaction(work) {
      const before = {
        events: new Map([...state.events].map(([k, v]) => [k, { ...v }])),
        registrations: new Map(
          [...state.registrations].map(([k, v]) => [k, { ...v }])
        ),
        outbox: [...state.outbox],
      };
      try {
        return await work(tx);
      } catch (error) {
        state = before;
        throw error;
      }
    },
  };

  function seedUser(id?: string): string {
    const userId = id ?? randomUUID();
    users.add(userId);
    return userId;
  }

  function seedEvent(seed: {
    organizerId: string;
    status?: EventRow["status"];
    startsAt: Date;
    registrationDeadline: Date;
    capacity: number;
    registeredCount?: number;
  }): string {
    const id = randomUUID();
    state.events.set(id, {
      id,
      organizerId: seed.organizerId,
      status: seed.status ?? "SCHEDULED",
      startsAt: seed.startsAt,
      registrationDeadline: seed.registrationDeadline,
      capacity: seed.capacity,
      registeredCount: seed.registeredCount ?? 0,
    });
    return id;
  }

  function seedRegistration(
    eventId: string,
    userId: string,
    regState: RegistrationState
  ): string {
    const id = randomUUID();
    state.registrations.set(id, { id, eventId, userId, state: regState });
    return id;
  }

  return {
    store,
    seedUser,
    seedEvent,
    seedRegistration,
    events: () => state.outbox,
    /**
     * Adapts this fake to the shape `describeEventStoreContract` factories
     * return.
     */
    harness: () => ({
      store,
      seedUser: async () => seedUser(),
      seedEvent: async (seed: Parameters<typeof seedEvent>[0]) =>
        seedEvent(seed),
      seedRegistration: async (
        eventId: string,
        userId: string,
        regState: RegistrationState
      ) => seedRegistration(eventId, userId, regState),
      outboxTypes: async () => state.outbox.map((e) => e.type),
    }),
  };
}
