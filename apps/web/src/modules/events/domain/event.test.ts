import { describe, expect, it } from "vitest";

import {
  classifyRegistrationRefusal,
  decideAttendance,
  decideCancelEvent,
  decideCancelRegistration,
  type EventFacts,
} from "./event";

const NOW = new Date("2026-06-01T00:00:00Z");
const PAST = new Date("2026-05-01T00:00:00Z");
const FUTURE = new Date("2026-07-01T00:00:00Z");

function makeEvent(overrides: Partial<EventFacts> = {}): EventFacts {
  return {
    status: "SCHEDULED",
    startsAt: FUTURE,
    registrationDeadline: FUTURE,
    capacity: 10,
    registeredCount: 0,
    organizerId: "organizer-1",
    ...overrides,
  };
}

describe("classifyRegistrationRefusal", () => {
  it("refuses NOT_FOUND for a null event", () => {
    expect(classifyRegistrationRefusal(null, null, NOW)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
  });

  it("refuses EVENT_CANCELLED before checking anything else", () => {
    const event = makeEvent({
      status: "CANCELLED",
      registrationDeadline: PAST,
      registeredCount: 10,
    });
    expect(classifyRegistrationRefusal(event, "REGISTERED", NOW)).toEqual({
      ok: false,
      code: "EVENT_CANCELLED",
    });
  });

  it.each(["REGISTERED", "ATTENDED", "NO_SHOW"] as const)(
    "refuses ALREADY_REGISTERED when the caller's own state is %s",
    (own) => {
      const event = makeEvent();
      expect(classifyRegistrationRefusal(event, own, NOW)).toEqual({
        ok: false,
        code: "ALREADY_REGISTERED",
      });
    }
  );

  it("does not refuse ALREADY_REGISTERED for a CANCELLED own registration", () => {
    const event = makeEvent();
    const result = classifyRegistrationRefusal(event, "CANCELLED", NOW);
    expect(result.code).not.toBe("ALREADY_REGISTERED");
  });

  it("refuses REGISTRATION_CLOSED when now is at the deadline", () => {
    const event = makeEvent({ registrationDeadline: NOW });
    expect(classifyRegistrationRefusal(event, null, NOW)).toEqual({
      ok: false,
      code: "REGISTRATION_CLOSED",
    });
  });

  it("refuses REGISTRATION_CLOSED when now is past the deadline", () => {
    const event = makeEvent({ registrationDeadline: PAST });
    expect(classifyRegistrationRefusal(event, null, NOW)).toEqual({
      ok: false,
      code: "REGISTRATION_CLOSED",
    });
  });

  it("refuses EVENT_FULL when the counter is at capacity", () => {
    const event = makeEvent({ capacity: 5, registeredCount: 5 });
    expect(classifyRegistrationRefusal(event, null, NOW)).toEqual({
      ok: false,
      code: "EVENT_FULL",
    });
  });

  it("falls back to EVENT_FULL when nothing else explains the miss (resolved race)", () => {
    const event = makeEvent({ capacity: 5, registeredCount: 2 });
    expect(classifyRegistrationRefusal(event, null, NOW)).toEqual({
      ok: false,
      code: "EVENT_FULL",
    });
  });
});

describe("decideCancelEvent", () => {
  const organizer = { userId: "organizer-1", canManageAny: false };
  const manager = { userId: "someone-else", canManageAny: true };
  const stranger = { userId: "someone-else", canManageAny: false };

  it("refuses NOT_FOUND for a null event", () => {
    expect(decideCancelEvent(null, organizer)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
  });

  it("allows the organizer", () => {
    expect(decideCancelEvent(makeEvent(), organizer)).toEqual({ ok: true });
  });

  it("allows an event.manage holder who is not the organizer", () => {
    expect(decideCancelEvent(makeEvent(), manager)).toEqual({ ok: true });
  });

  it("refuses PERMISSION_DENIED for a stranger", () => {
    expect(decideCancelEvent(makeEvent(), stranger)).toEqual({
      ok: false,
      code: "PERMISSION_DENIED",
    });
  });

  it("refuses INVALID_STATE_TRANSITION for an already-cancelled event", () => {
    const event = makeEvent({ status: "CANCELLED" });
    expect(decideCancelEvent(event, organizer)).toEqual({
      ok: false,
      code: "INVALID_STATE_TRANSITION",
    });
  });
});

describe("decideCancelRegistration", () => {
  it("refuses NOT_FOUND for a null event", () => {
    expect(decideCancelRegistration(null, "REGISTERED", NOW)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
  });

  it("refuses EVENT_CANCELLED", () => {
    const event = makeEvent({ status: "CANCELLED" });
    expect(decideCancelRegistration(event, "REGISTERED", NOW)).toEqual({
      ok: false,
      code: "EVENT_CANCELLED",
    });
  });

  it("refuses REGISTRATION_CLOSED once the event has started", () => {
    const event = makeEvent({ startsAt: NOW });
    expect(decideCancelRegistration(event, "REGISTERED", NOW)).toEqual({
      ok: false,
      code: "REGISTRATION_CLOSED",
    });
  });

  it.each([null, "CANCELLED"] as const)(
    "refuses NOT_FOUND when the caller's own state is %s",
    (own) => {
      const event = makeEvent();
      expect(decideCancelRegistration(event, own, NOW)).toEqual({
        ok: false,
        code: "NOT_FOUND",
      });
    }
  );

  it.each(["ATTENDED", "NO_SHOW"] as const)(
    "refuses INVALID_STATE_TRANSITION when the caller's own state is %s",
    (own) => {
      const event = makeEvent();
      expect(decideCancelRegistration(event, own, NOW)).toEqual({
        ok: false,
        code: "INVALID_STATE_TRANSITION",
      });
    }
  );

  it("falls back to INVALID_STATE_TRANSITION for a REGISTERED own state (resolved race)", () => {
    const event = makeEvent();
    expect(decideCancelRegistration(event, "REGISTERED", NOW)).toEqual({
      ok: false,
      code: "INVALID_STATE_TRANSITION",
    });
  });
});

describe("decideAttendance", () => {
  const organizer = { userId: "organizer-1", canManageAny: false };
  const manager = { userId: "someone-else", canManageAny: true };
  const stranger = { userId: "someone-else", canManageAny: false };
  const started = makeEvent({ startsAt: PAST });

  it("refuses NOT_FOUND for a null event", () => {
    expect(decideAttendance(null, "REGISTERED", organizer, NOW)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
  });

  it("refuses PERMISSION_DENIED for a stranger", () => {
    expect(decideAttendance(started, "REGISTERED", stranger, NOW)).toEqual({
      ok: false,
      code: "PERMISSION_DENIED",
    });
  });

  it("allows an event.manage holder", () => {
    expect(decideAttendance(started, "REGISTERED", manager, NOW)).toEqual({
      ok: true,
    });
  });

  it("refuses EVENT_CANCELLED even for the organizer", () => {
    const event = makeEvent({ status: "CANCELLED", startsAt: PAST });
    expect(decideAttendance(event, "REGISTERED", organizer, NOW)).toEqual({
      ok: false,
      code: "EVENT_CANCELLED",
    });
  });

  it("refuses INVALID_STATE_TRANSITION before the event starts", () => {
    const event = makeEvent({ startsAt: FUTURE });
    expect(decideAttendance(event, "REGISTERED", organizer, NOW)).toEqual({
      ok: false,
      code: "INVALID_STATE_TRANSITION",
    });
  });

  it("refuses NOT_FOUND when there is no registration", () => {
    expect(decideAttendance(started, null, organizer, NOW)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
  });

  it("refuses INVALID_STATE_TRANSITION for a cancelled registration", () => {
    expect(decideAttendance(started, "CANCELLED", organizer, NOW)).toEqual({
      ok: false,
      code: "INVALID_STATE_TRANSITION",
    });
  });

  it.each(["REGISTERED", "ATTENDED", "NO_SHOW"] as const)(
    "allows marking from %s after the event has started",
    (current) => {
      expect(decideAttendance(started, current, organizer, NOW)).toEqual({
        ok: true,
      });
    }
  );
});
