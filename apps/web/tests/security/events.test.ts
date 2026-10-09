import { describe, expect, it } from "vitest";

import {
  ROLE_PERMISSIONS,
  type RoleName,
} from "@nitap/database/role-permissions";

/** Organizer tools (cancelEvent, markAttendance, listRegistrants) against the REAL authorizer:
 * 401, 403 (a stranger, organizer/manager only), and the before-start state rule. */
import { AuthenticationError, AuthorizationError } from "@/lib/errors";
import { createAuthorization } from "@/modules/auth/application/authorize";
import type { Actor } from "@/modules/auth";
import { createCancelEvent } from "@/modules/events/application/cancel-event";
import type {
  EventDetailRow,
  EventQueries,
  Registrant,
} from "@/modules/events/application/event-queries";
import { createListRegistrants } from "@/modules/events/application/list-registrants";
import { createMarkAttendance } from "@/modules/events/application/mark-attendance";

import { createFakeEventStore } from "../support/fake-event-store";

const CLOCK = () => new Date("2026-02-01T12:00:00.000Z");
const { authorize, can } = createAuthorization({
  observer: { record() {} },
  now: CLOCK,
});

const grantsFor = (role: RoleName) =>
  ROLE_PERMISSIONS[role].map((permission) => ({
    permission,
    scope: "GLOBAL" as const,
    expiresAt: null,
  }));

const actor = (userId: string, over: Partial<Actor> = {}): Actor => ({
  userId,
  accountState: "VERIFIED",
  requestId: "r",
  grants: [],
  ...over,
});

const ORGANIZER = "00000000-0000-4000-8000-00000000000a";
const MANAGER = "00000000-0000-4000-8000-00000000000d";
const STRANGER = "00000000-0000-4000-8000-00000000000c";
const REGISTRANT = "00000000-0000-4000-8000-00000000000b";

const organizerActor = () => actor(ORGANIZER, { grants: grantsFor("ALUMNI") });
// ALUMNI_COORDINATOR holds event.manage but is not this event's organizer.
const managerActor = () =>
  actor(MANAGER, { grants: grantsFor("ALUMNI_COORDINATOR") });
const strangerActor = () => actor(STRANGER, { grants: grantsFor("ALUMNI") });

const status = (promise: Promise<unknown>) =>
  promise.then(
    () => 200,
    (e: { status?: number }) => e.status ?? 500
  );

const started = new Date("2026-02-01T10:00:00.000Z"); // before CLOCK: the event has started
const startedDeadline = new Date("2026-01-31T10:00:00.000Z");
const notStarted = new Date("2026-03-01T00:00:00.000Z"); // after CLOCK: not started yet
const notStartedDeadline = new Date("2026-02-20T00:00:00.000Z");

function buildEventLifecycle() {
  const fake = createFakeEventStore({ now: CLOCK });
  return {
    fake,
    cancelEvent: createCancelEvent({ store: fake.store, authorize, can }),
    markAttendance: createMarkAttendance({
      store: fake.store,
      authorize,
      can,
      now: CLOCK,
    }),
  };
}

describe("cancelEvent: real authorizer", () => {
  it("no session is a 401 and never cancels", async () => {
    const { cancelEvent, fake } = buildEventLifecycle();
    const eventId = fake.seedEvent({
      organizerId: ORGANIZER,
      startsAt: started,
      registrationDeadline: startedDeadline,
      capacity: 10,
    });
    await expect(cancelEvent({ actor: null, eventId })).rejects.toBeInstanceOf(
      AuthenticationError
    );
    const event = await fake.store.transaction((tx) => tx.findEvent(eventId));
    expect(event?.status).toBe("SCHEDULED");
  });

  it("the organizer may cancel", async () => {
    const { cancelEvent, fake } = buildEventLifecycle();
    const eventId = fake.seedEvent({
      organizerId: ORGANIZER,
      startsAt: started,
      registrationDeadline: startedDeadline,
      capacity: 10,
    });
    expect(
      await status(cancelEvent({ actor: organizerActor(), eventId }))
    ).toBe(200);
  });

  it("an event.manage holder who isn't the organizer may cancel", async () => {
    const { cancelEvent, fake } = buildEventLifecycle();
    const eventId = fake.seedEvent({
      organizerId: ORGANIZER,
      startsAt: started,
      registrationDeadline: startedDeadline,
      capacity: 10,
    });
    expect(await status(cancelEvent({ actor: managerActor(), eventId }))).toBe(
      200
    );
  });

  it("a stranger gets PERMISSION_DENIED, and the event is not cancelled", async () => {
    const { cancelEvent, fake } = buildEventLifecycle();
    const eventId = fake.seedEvent({
      organizerId: ORGANIZER,
      startsAt: started,
      registrationDeadline: startedDeadline,
      capacity: 10,
    });
    try {
      await cancelEvent({ actor: strangerActor(), eventId });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AuthorizationError);
      expect((error as AuthorizationError).code).toBe("PERMISSION_DENIED");
    }
    const event = await fake.store.transaction((tx) => tx.findEvent(eventId));
    expect(event?.status).toBe("SCHEDULED");
  });
});

describe("markAttendance: real authorizer", () => {
  it("no session is a 401 and never marks", async () => {
    const { markAttendance, fake } = buildEventLifecycle();
    const eventId = fake.seedEvent({
      organizerId: ORGANIZER,
      startsAt: started,
      registrationDeadline: startedDeadline,
      capacity: 10,
    });
    const registrationId = fake.seedRegistration(
      eventId,
      REGISTRANT,
      "REGISTERED"
    );
    await expect(
      markAttendance({
        actor: null,
        eventId,
        registrationId,
        state: "ATTENDED",
      })
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("the organizer may mark attendance once the event has started", async () => {
    const { markAttendance, fake } = buildEventLifecycle();
    const eventId = fake.seedEvent({
      organizerId: ORGANIZER,
      startsAt: started,
      registrationDeadline: startedDeadline,
      capacity: 10,
    });
    const registrationId = fake.seedRegistration(
      eventId,
      REGISTRANT,
      "REGISTERED"
    );
    expect(
      await status(
        markAttendance({
          actor: organizerActor(),
          eventId,
          registrationId,
          state: "ATTENDED",
        })
      )
    ).toBe(200);
  });

  it("an event.manage holder who isn't the organizer may mark attendance", async () => {
    const { markAttendance, fake } = buildEventLifecycle();
    const eventId = fake.seedEvent({
      organizerId: ORGANIZER,
      startsAt: started,
      registrationDeadline: startedDeadline,
      capacity: 10,
    });
    const registrationId = fake.seedRegistration(
      eventId,
      REGISTRANT,
      "REGISTERED"
    );
    expect(
      await status(
        markAttendance({
          actor: managerActor(),
          eventId,
          registrationId,
          state: "NO_SHOW",
        })
      )
    ).toBe(200);
  });

  it("a stranger gets PERMISSION_DENIED, and the registration is untouched", async () => {
    const { markAttendance, fake } = buildEventLifecycle();
    const eventId = fake.seedEvent({
      organizerId: ORGANIZER,
      startsAt: started,
      registrationDeadline: startedDeadline,
      capacity: 10,
    });
    const registrationId = fake.seedRegistration(
      eventId,
      REGISTRANT,
      "REGISTERED"
    );
    try {
      await markAttendance({
        actor: strangerActor(),
        eventId,
        registrationId,
        state: "ATTENDED",
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AuthorizationError);
      expect((error as AuthorizationError).code).toBe("PERMISSION_DENIED");
    }
    const row = await fake.store.transaction((tx) =>
      tx.findRegistration(eventId, { registrationId })
    );
    expect(row?.state).toBe("REGISTERED");
  });

  it("attendance before the start is INVALID_STATE_TRANSITION, even for the organizer", async () => {
    const { markAttendance, fake } = buildEventLifecycle();
    const eventId = fake.seedEvent({
      organizerId: ORGANIZER,
      startsAt: notStarted,
      registrationDeadline: notStartedDeadline,
      capacity: 10,
    });
    const registrationId = fake.seedRegistration(
      eventId,
      REGISTRANT,
      "REGISTERED"
    );
    expect(
      await status(
        markAttendance({
          actor: organizerActor(),
          eventId,
          registrationId,
          state: "ATTENDED",
        })
      )
    ).toBe(409);
  });
});

describe("listRegistrants: real authorizer", () => {
  const detailRow = (organizerId: string): EventDetailRow => ({
    id: "ev-1",
    title: "Event",
    description: "A long enough description of the event.",
    startsAt: started,
    timezone: "UTC",
    location: null,
    isOnline: true,
    capacity: 10,
    registeredCount: 1,
    registrationDeadline: startedDeadline,
    status: "SCHEDULED",
    organizer: { id: organizerId, name: "Org" },
    viewer: { registrationState: null },
  });

  const roster: Registrant[] = [
    {
      registrationId: "reg-1",
      userId: REGISTRANT,
      name: "Registrant One",
      state: "REGISTERED",
      registeredAt: new Date("2026-01-15T00:00:00Z"),
    },
  ];

  function build() {
    const queries: EventQueries = {
      list: async () => [],
      get: async () => detailRow(ORGANIZER),
      listRegistrants: async () => roster,
    };
    return { run: createListRegistrants({ queries, authorize, can }) };
  }

  it("no session is a 401", async () => {
    const { run } = build();
    expect(await status(run({ actor: null, eventId: "ev-1" }))).toBe(401);
  });

  it("the organizer may list registrants", async () => {
    const { run } = build();
    const result = await run({ actor: organizerActor(), eventId: "ev-1" });
    expect(result.data).toEqual(roster);
  });

  it("an event.manage holder who isn't the organizer may list registrants", async () => {
    const { run } = build();
    const result = await run({ actor: managerActor(), eventId: "ev-1" });
    expect(result.data).toEqual(roster);
  });

  it("a stranger gets PERMISSION_DENIED", async () => {
    const { run } = build();
    try {
      await run({ actor: strangerActor(), eventId: "ev-1" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AuthorizationError);
      expect((error as AuthorizationError).code).toBe("PERMISSION_DENIED");
    }
  });
});
