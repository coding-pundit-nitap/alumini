import { describe, expect, it, vi } from "vitest";

import { PERMISSIONS } from "@nitap/database/permissions";

import { AuthorizationError, ConflictError, NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { createFakeEventStore } from "../../../../tests/support/fake-event-store";
import type { Authorize } from "./ports";
import { createCancelRegistration } from "./cancel-registration";

const actor = { userId: "member-1" } as Actor;
const clock = () => new Date("2026-01-15T00:00:00.000Z");
const pastStart = new Date("2026-01-10T00:00:00.000Z");
const starts = new Date("2026-02-01T10:00:00.000Z");
const deadline = new Date("2026-01-31T10:00:00.000Z");

function setup(options: { allowed?: boolean } = {}) {
  const fake = createFakeEventStore({ now: clock });
  const asked: string[] = [];
  const authorize = ((a: Actor | null, permission: string) => {
    asked.push(permission);
    if (!a) throw new Error("no actor");
    if (options.allowed === false) throw new AuthorizationError();
    return a;
  }) as Authorize;
  const observe = vi.fn();
  const observeRefusal = vi.fn();
  return {
    fake,
    asked,
    observe,
    observeRefusal,
    run: createCancelRegistration({
      store: fake.store,
      authorize,
      observe,
      observeRefusal,
      now: clock,
    }),
  };
}

describe("createCancelRegistration", () => {
  it("denies without event.register", async () => {
    const s = setup({ allowed: false });
    await expect(s.run({ actor, eventId: "any" })).rejects.toBeInstanceOf(
      AuthorizationError
    );
    expect(s.asked).toEqual([PERMISSIONS.EVENT_REGISTER]);
  });

  it("refuses NOT_FOUND for a missing event", async () => {
    const s = setup();
    await expect(
      s.run({ actor, eventId: "missing-event" })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(s.observeRefusal).toHaveBeenCalledWith("NOT_FOUND");
  });

  it("refuses EVENT_CANCELLED for a cancelled event", async () => {
    const s = setup();
    const eventId = s.fake.seedEvent({
      organizerId: "organizer-1",
      status: "CANCELLED",
      startsAt: starts,
      registrationDeadline: deadline,
      capacity: 10,
      registeredCount: 1,
    });
    s.fake.seedRegistration(eventId, actor.userId, "REGISTERED");
    try {
      await s.run({ actor, eventId });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).code).toBe("EVENT_CANCELLED");
    }
    expect(s.observeRefusal).toHaveBeenCalledWith("EVENT_CANCELLED");
  });

  it("refuses REGISTRATION_CLOSED once the event has started (checked before own state)", async () => {
    const s = setup();
    const eventId = s.fake.seedEvent({
      organizerId: "organizer-1",
      startsAt: pastStart,
      registrationDeadline: pastStart,
      capacity: 10,
    });
    try {
      await s.run({ actor, eventId });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).code).toBe("REGISTRATION_CLOSED");
    }
    expect(s.observeRefusal).toHaveBeenCalledWith("REGISTRATION_CLOSED");
  });

  it("refuses NOT_FOUND when the caller has no registration", async () => {
    const s = setup();
    const eventId = s.fake.seedEvent({
      organizerId: "organizer-1",
      startsAt: starts,
      registrationDeadline: deadline,
      capacity: 10,
    });
    await expect(s.run({ actor, eventId })).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(s.observeRefusal).toHaveBeenCalledWith("NOT_FOUND");
  });

  it("refuses NOT_FOUND (release guard misses, own registration already cancelled)", async () => {
    const s = setup();
    const eventId = s.fake.seedEvent({
      organizerId: "organizer-1",
      startsAt: starts,
      registrationDeadline: deadline,
      capacity: 10,
    });
    s.fake.seedRegistration(eventId, actor.userId, "CANCELLED");
    await expect(s.run({ actor, eventId })).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(s.observeRefusal).toHaveBeenCalledWith("NOT_FOUND");
  });

  it("refuses INVALID_STATE_TRANSITION for an ATTENDED registration (release guard misses on empty seat count)", async () => {
    const s = setup();
    const eventId = s.fake.seedEvent({
      organizerId: "organizer-1",
      startsAt: starts,
      registrationDeadline: deadline,
      capacity: 10,
      // registeredCount left at 0 so releaseSeat's guard misses even though the event is otherwise open.
    });
    s.fake.seedRegistration(eventId, actor.userId, "ATTENDED");
    try {
      await s.run({ actor, eventId });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).code).toBe("INVALID_STATE_TRANSITION");
    }
    expect(s.observeRefusal).toHaveBeenCalledWith("INVALID_STATE_TRANSITION");
  });

  it("cancels, enqueues event.registration-cancelled, and observes after commit", async () => {
    const s = setup();
    const eventId = s.fake.seedEvent({
      organizerId: "organizer-1",
      startsAt: starts,
      registrationDeadline: deadline,
      capacity: 10,
      registeredCount: 1,
    });
    s.fake.seedRegistration(eventId, actor.userId, "REGISTERED");

    await s.run({ actor, eventId });

    const outbox = s.fake.events();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      type: "event.registration-cancelled",
      payload: {
        v: 1,
        eventId,
        userId: actor.userId,
        actorId: actor.userId,
      },
    });
    expect(s.observe).toHaveBeenCalledWith("registration_cancelled", eventId);
    expect(s.observeRefusal).not.toHaveBeenCalled();

    const event = await s.fake.store.transaction((tx) => tx.findEvent(eventId));
    expect(event?.registeredCount).toBe(0);
  });

  it("rolls back the released seat when cancelRegistration races to null", async () => {
    const s = setup();
    const eventId = s.fake.seedEvent({
      organizerId: "organizer-1",
      startsAt: starts,
      registrationDeadline: deadline,
      capacity: 10,
      registeredCount: 1,
    });
    s.fake.seedRegistration(eventId, actor.userId, "REGISTERED");

    const tx = await s.fake.store.transaction(async (t) => t);
    const before = await tx.findEvent(eventId);
    // Simulate a race: releaseSeat succeeds, cancelRegistration then misses.
    const spy = vi.spyOn(tx, "cancelRegistration").mockResolvedValue(null);

    await expect(s.run({ actor, eventId })).rejects.toBeInstanceOf(
      ConflictError
    );

    spy.mockRestore();
    const after = await tx.findEvent(eventId);
    expect(after?.registeredCount).toBe(before?.registeredCount);
  });
});
