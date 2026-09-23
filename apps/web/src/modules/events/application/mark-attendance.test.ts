import { describe, expect, it, vi } from "vitest";

import { PERMISSIONS } from "@nitap/database/permissions";

import { AuthorizationError, ConflictError, NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { createFakeEventStore } from "../../../../tests/support/fake-event-store";
import { createMarkAttendance } from "./mark-attendance";
import type { Authorize } from "./ports";

const organizer = { userId: "organizer-1" } as Actor;
const stranger = { userId: "stranger-1" } as Actor;
const registrant = { userId: "member-1" } as Actor;
const clock = () => new Date("2026-02-01T12:00:00.000Z"); // after `starts`, before `futureStarts`
const starts = new Date("2026-02-01T10:00:00.000Z");
const deadline = new Date("2026-01-31T10:00:00.000Z");
const futureStarts = new Date("2026-03-01T00:00:00.000Z"); // clock is before this event's start
const futureDeadline = new Date("2026-02-20T00:00:00.000Z");

function setup(
  options: { allowed?: boolean; canManageAny?: boolean; now?: () => Date } = {}
) {
  const fake = createFakeEventStore({ now: options.now ?? clock });
  const asked: string[] = [];
  const authorize = ((a: Actor | null, permission: string) => {
    asked.push(permission);
    if (!a) throw new Error("no actor");
    if (options.allowed === false) throw new AuthorizationError();
    return a;
  }) as Authorize;
  const can = vi.fn(() => options.canManageAny ?? false);
  const observe = vi.fn();
  const observeRefusal = vi.fn();
  return {
    fake,
    asked,
    can,
    observe,
    observeRefusal,
    run: createMarkAttendance({
      store: fake.store,
      authorize,
      can,
      observe,
      observeRefusal,
      now: options.now ?? clock,
    }),
  };
}

describe("createMarkAttendance", () => {
  it("requires event.read (base authentication)", async () => {
    const s = setup({ allowed: false });
    await expect(
      s.run({
        actor: organizer,
        eventId: "any",
        registrationId: "any",
        state: "ATTENDED",
      })
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(s.asked).toEqual([PERMISSIONS.EVENT_READ]);
  });

  it("refuses NOT_FOUND for a missing event", async () => {
    const s = setup();
    await expect(
      s.run({
        actor: organizer,
        eventId: "missing",
        registrationId: "any",
        state: "ATTENDED",
      })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(s.observeRefusal).toHaveBeenCalledWith("NOT_FOUND");
  });

  it("lets the organizer mark attendance after the start", async () => {
    const s = setup();
    const eventId = s.fake.seedEvent({
      organizerId: organizer.userId,
      startsAt: starts,
      registrationDeadline: deadline,
      capacity: 10,
      registeredCount: 1,
    });
    const registrationId = s.fake.seedRegistration(
      eventId,
      registrant.userId,
      "REGISTERED"
    );

    const result = await s.run({
      actor: organizer,
      eventId,
      registrationId,
      state: "ATTENDED",
    });
    expect(result.registrationId).toBe(registrationId);

    const outbox = s.fake.events();
    expect(outbox).toEqual([
      {
        type: "event.attendance-marked",
        payload: {
          v: 1,
          eventId,
          registrationId,
          userId: registrant.userId,
          actorId: organizer.userId,
        },
      },
    ]);
    expect(s.observe).toHaveBeenCalledWith("attendance_marked", eventId);
    expect(s.observeRefusal).not.toHaveBeenCalled();
  });

  it("lets an event.manage holder mark attendance on someone else's event", async () => {
    const s = setup({ canManageAny: true });
    const eventId = s.fake.seedEvent({
      organizerId: organizer.userId,
      startsAt: starts,
      registrationDeadline: deadline,
      capacity: 10,
      registeredCount: 1,
    });
    const registrationId = s.fake.seedRegistration(
      eventId,
      registrant.userId,
      "REGISTERED"
    );

    await s.run({
      actor: stranger,
      eventId,
      registrationId,
      state: "NO_SHOW",
    });
    expect(s.can).toHaveBeenCalledWith(
      expect.objectContaining({ userId: stranger.userId }),
      PERMISSIONS.EVENT_MANAGE
    );
  });

  it("refuses PERMISSION_DENIED for a stranger without event.manage", async () => {
    const s = setup({ canManageAny: false });
    const eventId = s.fake.seedEvent({
      organizerId: organizer.userId,
      startsAt: starts,
      registrationDeadline: deadline,
      capacity: 10,
      registeredCount: 1,
    });
    const registrationId = s.fake.seedRegistration(
      eventId,
      registrant.userId,
      "REGISTERED"
    );

    try {
      await s.run({
        actor: stranger,
        eventId,
        registrationId,
        state: "ATTENDED",
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AuthorizationError);
      expect((error as AuthorizationError).code).toBe("PERMISSION_DENIED");
    }
    expect(s.observeRefusal).toHaveBeenCalledWith("PERMISSION_DENIED");
  });

  it("refuses INVALID_STATE_TRANSITION before the event has started", async () => {
    const s = setup();
    const eventId = s.fake.seedEvent({
      organizerId: organizer.userId,
      startsAt: futureStarts,
      registrationDeadline: futureDeadline,
      capacity: 10,
      registeredCount: 1,
    });
    const registrationId = s.fake.seedRegistration(
      eventId,
      registrant.userId,
      "REGISTERED"
    );
    try {
      await s.run({
        actor: organizer,
        eventId,
        registrationId,
        state: "ATTENDED",
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).code).toBe("INVALID_STATE_TRANSITION");
    }
    expect(s.observeRefusal).toHaveBeenCalledWith("INVALID_STATE_TRANSITION");
  });

  it("refuses EVENT_CANCELLED for a cancelled event", async () => {
    const s = setup();
    const eventId = s.fake.seedEvent({
      organizerId: organizer.userId,
      status: "CANCELLED",
      startsAt: starts,
      registrationDeadline: deadline,
      capacity: 10,
      registeredCount: 1,
    });
    const registrationId = s.fake.seedRegistration(
      eventId,
      registrant.userId,
      "REGISTERED"
    );

    try {
      await s.run({
        actor: organizer,
        eventId,
        registrationId,
        state: "ATTENDED",
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).code).toBe("EVENT_CANCELLED");
    }
  });

  it("refuses NOT_FOUND for an unknown registration", async () => {
    const s = setup();
    const eventId = s.fake.seedEvent({
      organizerId: organizer.userId,
      startsAt: starts,
      registrationDeadline: deadline,
      capacity: 10,
    });

    await expect(
      s.run({
        actor: organizer,
        eventId,
        registrationId: "missing",
        state: "ATTENDED",
      })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(s.observeRefusal).toHaveBeenCalledWith("NOT_FOUND");
  });

  it("refuses INVALID_STATE_TRANSITION for a cancelled registration", async () => {
    const s = setup();
    const eventId = s.fake.seedEvent({
      organizerId: organizer.userId,
      startsAt: starts,
      registrationDeadline: deadline,
      capacity: 10,
    });
    const registrationId = s.fake.seedRegistration(
      eventId,
      registrant.userId,
      "CANCELLED"
    );

    try {
      await s.run({
        actor: organizer,
        eventId,
        registrationId,
        state: "ATTENDED",
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).code).toBe("INVALID_STATE_TRANSITION");
    }
  });

  it("allows correcting an already-marked registration (ATTENDED -> NO_SHOW)", async () => {
    const s = setup();
    const eventId = s.fake.seedEvent({
      organizerId: organizer.userId,
      startsAt: starts,
      registrationDeadline: deadline,
      capacity: 10,
    });
    const registrationId = s.fake.seedRegistration(
      eventId,
      registrant.userId,
      "ATTENDED"
    );

    await s.run({
      actor: organizer,
      eventId,
      registrationId,
      state: "NO_SHOW",
    });
    const row = await s.fake.store.transaction((tx) =>
      tx.findRegistration(eventId, { registrationId })
    );
    expect(row?.state).toBe("NO_SHOW");
  });
});
