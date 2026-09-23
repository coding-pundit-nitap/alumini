import { describe, expect, it, vi } from "vitest";

import { PERMISSIONS } from "@nitap/database/permissions";

import { AuthorizationError, ConflictError, NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { createFakeEventStore } from "../../../../tests/support/fake-event-store";
import { createCancelEvent } from "./cancel-event";
import type { Authorize } from "./ports";

const organizer = { userId: "organizer-1" } as Actor;
const stranger = { userId: "stranger-1" } as Actor;
const starts = new Date("2026-02-01T10:00:00.000Z");
const deadline = new Date("2026-01-31T10:00:00.000Z");

function setup(options: { allowed?: boolean; canManageAny?: boolean } = {}) {
  const fake = createFakeEventStore();
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
    run: createCancelEvent({
      store: fake.store,
      authorize,
      can,
      observe,
      observeRefusal,
    }),
  };
}

describe("createCancelEvent", () => {
  it("requires event.read (base authentication)", async () => {
    const s = setup({ allowed: false });
    await expect(
      s.run({ actor: organizer, eventId: "any" })
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(s.asked).toEqual([PERMISSIONS.EVENT_READ]);
  });

  it("refuses NOT_FOUND for a missing event", async () => {
    const s = setup();
    await expect(
      s.run({ actor: organizer, eventId: "missing" })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(s.observeRefusal).toHaveBeenCalledWith("NOT_FOUND");
  });

  it("lets the organizer cancel", async () => {
    const s = setup();
    const eventId = s.fake.seedEvent({
      organizerId: organizer.userId,
      startsAt: starts,
      registrationDeadline: deadline,
      capacity: 10,
    });

    const result = await s.run({ actor: organizer, eventId });
    expect(result.eventId).toBe(eventId);

    const outbox = s.fake.events();
    expect(outbox).toEqual([
      {
        type: "event.cancelled",
        payload: { v: 1, eventId, actorId: organizer.userId },
      },
    ]);
    expect(s.observe).toHaveBeenCalledWith("cancelled", eventId);
    expect(s.observeRefusal).not.toHaveBeenCalled();

    const event = await s.fake.store.transaction((tx) => tx.findEvent(eventId));
    expect(event?.status).toBe("CANCELLED");
  });

  it("lets an event.manage holder cancel someone else's event", async () => {
    const s = setup({ canManageAny: true });
    const eventId = s.fake.seedEvent({
      organizerId: organizer.userId,
      startsAt: starts,
      registrationDeadline: deadline,
      capacity: 10,
    });

    await s.run({ actor: stranger, eventId });
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
    });

    try {
      await s.run({ actor: stranger, eventId });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AuthorizationError);
      expect((error as AuthorizationError).code).toBe("PERMISSION_DENIED");
    }
    expect(s.observeRefusal).toHaveBeenCalledWith("PERMISSION_DENIED");

    const event = await s.fake.store.transaction((tx) => tx.findEvent(eventId));
    expect(event?.status).toBe("SCHEDULED");
  });

  it("refuses INVALID_STATE_TRANSITION for an already cancelled event", async () => {
    const s = setup();
    const eventId = s.fake.seedEvent({
      organizerId: organizer.userId,
      status: "CANCELLED",
      startsAt: starts,
      registrationDeadline: deadline,
      capacity: 10,
    });

    try {
      await s.run({ actor: organizer, eventId });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).code).toBe("INVALID_STATE_TRANSITION");
    }
    expect(s.observeRefusal).toHaveBeenCalledWith("INVALID_STATE_TRANSITION");
  });
});
