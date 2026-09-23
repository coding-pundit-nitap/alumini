import { describe, expect, it } from "vitest";

import { eventJobs } from "./events.ts";
import { OUTBOX_EVENTS, isOutboxEventType } from "./registry.ts";

const id = () => crypto.randomUUID();

describe("event.* outbox contracts", () => {
  it("registers all five as outbox events on the default queue", () => {
    const names = [
      "event.created",
      "event.cancelled",
      "event.registered",
      "event.registration-cancelled",
      "event.attendance-marked",
    ] as const;
    expect(Object.keys(eventJobs).sort()).toEqual([...names].sort());
    for (const name of names) {
      expect(isOutboxEventType(name)).toBe(true);
      expect(OUTBOX_EVENTS[name]).toBe(eventJobs[name]);
      expect(OUTBOX_EVENTS[name].queue).toBe("default");
    }
  });

  it("lifecycle events carry the event and the actor, ids only", () => {
    const payload = { v: 1, eventId: id(), actorId: id() };
    for (const name of ["event.created", "event.cancelled"] as const) {
      const { schema } = eventJobs[name];
      expect(schema.safeParse(payload).success).toBe(true);
      expect(schema.safeParse({ ...payload, title: "Meetup" }).success).toBe(
        false
      );
      expect(schema.safeParse({ ...payload, eventId: "nope" }).success).toBe(
        false
      );
    }
  });

  it("registration events also carry the registration and the registrant", () => {
    const payload = {
      v: 1,
      eventId: id(),
      registrationId: id(),
      userId: id(),
      actorId: id(),
    };
    for (const name of [
      "event.registered",
      "event.registration-cancelled",
      "event.attendance-marked",
    ] as const) {
      const { schema } = eventJobs[name];
      expect(schema.safeParse(payload).success).toBe(true);
      expect(
        schema.safeParse({ ...payload, registrationId: undefined }).success
      ).toBe(false);
      expect(schema.safeParse({ ...payload, email: "a@b.c" }).success).toBe(
        false
      );
    }
  });
});
