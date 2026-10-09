import { describe, expect, it } from "vitest";

import type {
  EventStatus,
  RegistrationState,
} from "@/modules/events/domain/event";
import type { EventStore } from "@/modules/events/application/ports";

export type EventSeed = {
  organizerId: string;
  status?: EventStatus;
  startsAt: Date;
  registrationDeadline: Date;
  capacity: number;
  registeredCount?: number;
};

export type EventStoreHarness = {
  store: EventStore;
  seedEvent(seed: EventSeed): Promise<string>;
  seedUser(): Promise<string>;
  seedRegistration(
    eventId: string,
    userId: string,
    state: RegistrationState
  ): Promise<string>;
  /** The types of every outbox row written so far, for rollback assertions. */
  outboxTypes(): Promise<string[]>;
};

const HOUR = 60 * 60 * 1000;

/**
 * Behaviour every EventStore must satisfy, run against the fake and against Prisma. The fake's clock is real
 * `Date.now()` so a "now - 1h" deadline reads as past for both.
 */
export function describeEventStoreContract(
  name: string,
  factory: () => Promise<EventStoreHarness>
) {
  describe(`EventStore contract (${name})`, () => {
    it("claimSeat is true under capacity and before the deadline", async () => {
      const h = await factory();
      const organizerId = await h.seedUser();
      const eventId = await h.seedEvent({
        organizerId,
        startsAt: new Date(Date.now() + HOUR),
        registrationDeadline: new Date(Date.now() + HOUR - 1),
        capacity: 5,
        registeredCount: 0,
      });

      const claimed = await h.store.transaction((tx) => tx.claimSeat(eventId));
      expect(claimed).toBe(true);

      const after = await h.store.transaction((tx) => tx.findEvent(eventId));
      expect(after?.registeredCount).toBe(1);
    });

    it("claimSeat is false at capacity", async () => {
      const h = await factory();
      const organizerId = await h.seedUser();
      const eventId = await h.seedEvent({
        organizerId,
        startsAt: new Date(Date.now() + HOUR),
        registrationDeadline: new Date(Date.now() + HOUR - 1),
        capacity: 1,
        registeredCount: 1,
      });

      const claimed = await h.store.transaction((tx) => tx.claimSeat(eventId));
      expect(claimed).toBe(false);
    });

    it("claimSeat is false when the event is cancelled", async () => {
      const h = await factory();
      const organizerId = await h.seedUser();
      const eventId = await h.seedEvent({
        organizerId,
        status: "CANCELLED",
        startsAt: new Date(Date.now() + HOUR),
        registrationDeadline: new Date(Date.now() + HOUR - 1),
        capacity: 5,
        registeredCount: 0,
      });

      const claimed = await h.store.transaction((tx) => tx.claimSeat(eventId));
      expect(claimed).toBe(false);
    });

    it("claimSeat is false at or after the registration deadline", async () => {
      const h = await factory();
      const organizerId = await h.seedUser();
      const eventId = await h.seedEvent({
        organizerId,
        startsAt: new Date(Date.now() + HOUR),
        registrationDeadline: new Date(Date.now() - HOUR),
        capacity: 5,
        registeredCount: 0,
      });

      const claimed = await h.store.transaction((tx) => tx.claimSeat(eventId));
      expect(claimed).toBe(false);
    });

    it("upsertRegistration inserts a new row and returns its id", async () => {
      const h = await factory();
      const organizerId = await h.seedUser();
      const userId = await h.seedUser();
      const eventId = await h.seedEvent({
        organizerId,
        startsAt: new Date(Date.now() + HOUR),
        registrationDeadline: new Date(Date.now() + HOUR - 1),
        capacity: 5,
      });

      const result = await h.store.transaction((tx) =>
        tx.upsertRegistration(eventId, userId)
      );
      expect(result?.id).toBeTruthy();

      const found = await h.store.transaction((tx) =>
        tx.findRegistration(eventId, { userId })
      );
      expect(found?.state).toBe("REGISTERED");
    });

    it("upsertRegistration returns null when an existing REGISTERED row exists", async () => {
      const h = await factory();
      const organizerId = await h.seedUser();
      const userId = await h.seedUser();
      const eventId = await h.seedEvent({
        organizerId,
        startsAt: new Date(Date.now() + HOUR),
        registrationDeadline: new Date(Date.now() + HOUR - 1),
        capacity: 5,
      });
      await h.seedRegistration(eventId, userId, "REGISTERED");

      const result = await h.store.transaction((tx) =>
        tx.upsertRegistration(eventId, userId)
      );
      expect(result).toBeNull();
    });

    it("upsertRegistration reuses a CANCELLED row (same id) and sets it REGISTERED", async () => {
      const h = await factory();
      const organizerId = await h.seedUser();
      const userId = await h.seedUser();
      const eventId = await h.seedEvent({
        organizerId,
        startsAt: new Date(Date.now() + HOUR),
        registrationDeadline: new Date(Date.now() + HOUR - 1),
        capacity: 5,
      });
      const cancelledId = await h.seedRegistration(
        eventId,
        userId,
        "CANCELLED"
      );

      const result = await h.store.transaction((tx) =>
        tx.upsertRegistration(eventId, userId)
      );
      expect(result?.id).toBe(cancelledId);

      const found = await h.store.transaction((tx) =>
        tx.findRegistration(eventId, { userId })
      );
      expect(found?.state).toBe("REGISTERED");
    });

    it("releaseSeat is true before the start", async () => {
      const h = await factory();
      const organizerId = await h.seedUser();
      const eventId = await h.seedEvent({
        organizerId,
        startsAt: new Date(Date.now() + HOUR),
        registrationDeadline: new Date(Date.now() + HOUR - 1),
        capacity: 5,
        registeredCount: 1,
      });

      const released = await h.store.transaction((tx) =>
        tx.releaseSeat(eventId)
      );
      expect(released).toBe(true);
    });

    it("releaseSeat returns false and leaves the count at 0 when registeredCount is 0", async () => {
      const h = await factory();
      const organizerId = await h.seedUser();
      const eventId = await h.seedEvent({
        organizerId,
        startsAt: new Date(Date.now() + HOUR),
        registrationDeadline: new Date(Date.now() + HOUR - 1),
        capacity: 5,
        registeredCount: 0,
      });

      const released = await h.store.transaction((tx) =>
        tx.releaseSeat(eventId)
      );
      expect(released).toBe(false);

      const after = await h.store.transaction((tx) => tx.findEvent(eventId));
      expect(after?.registeredCount).toBe(0);
    });

    it("releaseSeat is false after the start", async () => {
      const h = await factory();
      const organizerId = await h.seedUser();
      const eventId = await h.seedEvent({
        organizerId,
        startsAt: new Date(Date.now() - HOUR),
        registrationDeadline: new Date(Date.now() - 2 * HOUR),
        capacity: 5,
        registeredCount: 1,
      });

      const released = await h.store.transaction((tx) =>
        tx.releaseSeat(eventId)
      );
      expect(released).toBe(false);
    });

    it("releaseSeat is false when the event is cancelled", async () => {
      const h = await factory();
      const organizerId = await h.seedUser();
      const eventId = await h.seedEvent({
        organizerId,
        status: "CANCELLED",
        startsAt: new Date(Date.now() + HOUR),
        registrationDeadline: new Date(Date.now() + HOUR - 1),
        capacity: 5,
        registeredCount: 1,
      });

      const released = await h.store.transaction((tx) =>
        tx.releaseSeat(eventId)
      );
      expect(released).toBe(false);
    });

    it("cancelRegistration moves only a REGISTERED row; null for an ATTENDED one", async () => {
      const h = await factory();
      const organizerId = await h.seedUser();
      const registeredUser = await h.seedUser();
      const attendedUser = await h.seedUser();
      const eventId = await h.seedEvent({
        organizerId,
        startsAt: new Date(Date.now() + HOUR),
        registrationDeadline: new Date(Date.now() + HOUR - 1),
        capacity: 5,
        registeredCount: 2,
      });
      await h.seedRegistration(eventId, registeredUser, "REGISTERED");
      await h.seedRegistration(eventId, attendedUser, "ATTENDED");

      const cancelled = await h.store.transaction((tx) =>
        tx.cancelRegistration(eventId, registeredUser)
      );
      expect(cancelled?.id).toBeTruthy();

      const blocked = await h.store.transaction((tx) =>
        tx.cancelRegistration(eventId, attendedUser)
      );
      expect(blocked).toBeNull();
    });

    it("markAttendance moves REGISTERED to ATTENDED and ATTENDED to NO_SHOW", async () => {
      const h = await factory();
      const organizerId = await h.seedUser();
      const userId = await h.seedUser();
      const eventId = await h.seedEvent({
        organizerId,
        startsAt: new Date(Date.now() - HOUR),
        registrationDeadline: new Date(Date.now() - 2 * HOUR),
        capacity: 5,
        registeredCount: 1,
      });
      const registrationId = await h.seedRegistration(
        eventId,
        userId,
        "REGISTERED"
      );

      const attended = await h.store.transaction((tx) =>
        tx.markAttendance(eventId, registrationId, "ATTENDED")
      );
      expect(attended).toEqual({ id: registrationId, userId });

      const noShow = await h.store.transaction((tx) =>
        tx.markAttendance(eventId, registrationId, "NO_SHOW")
      );
      expect(noShow).toEqual({ id: registrationId, userId });
    });

    it("markAttendance is null for a CANCELLED row and for a registration of another event", async () => {
      const h = await factory();
      const organizerId = await h.seedUser();
      const cancelledUser = await h.seedUser();
      const otherUser = await h.seedUser();
      const eventId = await h.seedEvent({
        organizerId,
        startsAt: new Date(Date.now() - HOUR),
        registrationDeadline: new Date(Date.now() - 2 * HOUR),
        capacity: 5,
        registeredCount: 0,
      });
      const otherEventId = await h.seedEvent({
        organizerId,
        startsAt: new Date(Date.now() - HOUR),
        registrationDeadline: new Date(Date.now() - 2 * HOUR),
        capacity: 5,
        registeredCount: 1,
      });
      const cancelledId = await h.seedRegistration(
        eventId,
        cancelledUser,
        "CANCELLED"
      );
      const otherRegistrationId = await h.seedRegistration(
        otherEventId,
        otherUser,
        "REGISTERED"
      );

      const forCancelled = await h.store.transaction((tx) =>
        tx.markAttendance(eventId, cancelledId, "ATTENDED")
      );
      expect(forCancelled).toBeNull();

      const forOtherEvent = await h.store.transaction((tx) =>
        tx.markAttendance(eventId, otherRegistrationId, "ATTENDED")
      );
      expect(forOtherEvent).toBeNull();
    });

    it("cancelEvent is true once, then false", async () => {
      const h = await factory();
      const organizerId = await h.seedUser();
      const eventId = await h.seedEvent({
        organizerId,
        startsAt: new Date(Date.now() + HOUR),
        registrationDeadline: new Date(Date.now() + HOUR - 1),
        capacity: 5,
      });

      const first = await h.store.transaction((tx) => tx.cancelEvent(eventId));
      expect(first).toBe(true);

      const second = await h.store.transaction((tx) => tx.cancelEvent(eventId));
      expect(second).toBe(false);
    });

    it("findEvent returns null for an unknown id", async () => {
      const h = await factory();
      const found = await h.store.transaction((tx) =>
        tx.findEvent("00000000-0000-4000-8000-000000000000")
      );
      expect(found).toBeNull();
    });

    it("a transaction that enqueues then throws leaves no outbox row and no counter change", async () => {
      const h = await factory();
      const organizerId = await h.seedUser();
      const eventId = await h.seedEvent({
        organizerId,
        startsAt: new Date(Date.now() + HOUR),
        registrationDeadline: new Date(Date.now() + HOUR - 1),
        capacity: 5,
        registeredCount: 0,
      });

      await expect(
        h.store.transaction(async (tx) => {
          const claimed = await tx.claimSeat(eventId);
          expect(claimed).toBe(true);
          await tx.enqueue({
            type: "event.registered",
            payload: {
              v: 1,
              eventId,
              registrationId: "00000000-0000-4000-8000-000000000001",
              userId: organizerId,
              actorId: organizerId,
            },
          });
          throw new Error("boom");
        })
      ).rejects.toThrow("boom");

      const after = await h.store.transaction((tx) => tx.findEvent(eventId));
      expect(after?.registeredCount).toBe(0);

      const types = await h.outboxTypes();
      expect(types).not.toContain("event.registered");
    });
  });
}
