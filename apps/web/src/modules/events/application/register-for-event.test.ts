import { describe, expect, it, vi } from "vitest";

import { PERMISSIONS } from "@nitap/database/permissions";

import { AuthorizationError, ConflictError, NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { createFakeEventStore } from "../../../../tests/support/fake-event-store";
import type { Authorize } from "./ports";
import { createRegisterForEvent } from "./register-for-event";

const actor = { userId: "member-1" } as Actor;
const clock = () => new Date("2026-01-15T00:00:00.000Z");
const pastDeadline = new Date("2026-01-10T00:00:00.000Z");
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
    run: createRegisterForEvent({
      store: fake.store,
      authorize,
      observe,
      observeRefusal,
      now: clock,
    }),
  };
}

describe("createRegisterForEvent", () => {
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
    });
    try {
      await s.run({ actor, eventId });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).code).toBe("EVENT_CANCELLED");
    }
    expect(s.observeRefusal).toHaveBeenCalledWith("EVENT_CANCELLED");
  });

  it("refuses ALREADY_REGISTERED when already registered", async () => {
    const s = setup();
    const eventId = s.fake.seedEvent({
      organizerId: "organizer-1",
      startsAt: starts,
      registrationDeadline: deadline,
      capacity: 10,
    });
    s.fake.seedRegistration(eventId, actor.userId, "REGISTERED");
    try {
      await s.run({ actor, eventId });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).code).toBe("ALREADY_REGISTERED");
    }
    expect(s.observeRefusal).toHaveBeenCalledWith("ALREADY_REGISTERED");
  });

  it("refuses REGISTRATION_CLOSED after the deadline", async () => {
    const s = setup();
    const eventId = s.fake.seedEvent({
      organizerId: "organizer-1",
      startsAt: starts,
      registrationDeadline: pastDeadline,
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

  it("refuses EVENT_FULL at capacity", async () => {
    const s = setup();
    const eventId = s.fake.seedEvent({
      organizerId: "organizer-1",
      startsAt: starts,
      registrationDeadline: deadline,
      capacity: 1,
      registeredCount: 1,
    });
    try {
      await s.run({ actor, eventId });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).code).toBe("EVENT_FULL");
    }
    expect(s.observeRefusal).toHaveBeenCalledWith("EVENT_FULL");
  });

  it("registers, enqueues event.registered, and observes after commit", async () => {
    const s = setup();
    const eventId = s.fake.seedEvent({
      organizerId: "organizer-1",
      startsAt: starts,
      registrationDeadline: deadline,
      capacity: 10,
    });
    const result = await s.run({ actor, eventId });
    expect(result.registrationId).toBeTruthy();

    const outbox = s.fake.events();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toEqual({
      type: "event.registered",
      payload: {
        v: 1,
        eventId,
        registrationId: result.registrationId,
        userId: actor.userId,
        actorId: actor.userId,
      },
    });
    expect(s.observe).toHaveBeenCalledWith("registered", eventId);
    expect(s.observeRefusal).not.toHaveBeenCalled();
  });

  it("re-registers a cancelled registration (reused row)", async () => {
    const s = setup();
    const eventId = s.fake.seedEvent({
      organizerId: "organizer-1",
      startsAt: starts,
      registrationDeadline: deadline,
      capacity: 10,
    });
    s.fake.seedRegistration(eventId, actor.userId, "CANCELLED");
    const result = await s.run({ actor, eventId });
    expect(result.registrationId).toBeTruthy();
    expect(s.observe).toHaveBeenCalledWith("registered", eventId);
  });

  it("rolls back the claimed seat when upsertRegistration races to null", async () => {
    const s = setup();
    const eventId = s.fake.seedEvent({
      organizerId: "organizer-1",
      startsAt: starts,
      registrationDeadline: deadline,
      capacity: 10,
    });
    const tx = await s.fake.store.transaction(async (t) => t);
    const before = await tx.findEvent(eventId);
    // Simulate the already-registered race: claimSeat succeeds, upsertRegistration then misses.
    const spy = vi.spyOn(tx, "upsertRegistration").mockResolvedValue(null);

    await expect(s.run({ actor, eventId })).rejects.toBeInstanceOf(
      ConflictError
    );

    spy.mockRestore();
    const after = await tx.findEvent(eventId);
    expect(after?.registeredCount).toBe(before?.registeredCount);
  });
});
