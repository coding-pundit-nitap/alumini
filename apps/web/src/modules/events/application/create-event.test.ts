import { describe, expect, it, vi } from "vitest";

import { PERMISSIONS } from "@nitap/database/permissions";

import {
  AuthorizationError,
  RateLimitedError,
  ValidationError,
} from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { createFakeEventStore } from "../../../../tests/support/fake-event-store";
import type { Authorize, RateLimiter } from "./ports";
import { CREATE_RATE, createCreateEvent } from "./create-event";

const actor = { userId: "organizer-1" } as Actor;
const clock = () => new Date("2026-01-01T00:00:00.000Z");

const validInput = {
  title: "Alumni Meetup",
  description: "A meetup for alumni to reconnect and share notes.",
  startsAt: "2026-02-01T10:00:00.000Z",
  timezone: "Asia/Kolkata",
  location: "Main Hall",
  isOnline: false,
  capacity: 50,
  registrationDeadline: "2026-01-31T10:00:00.000Z",
};

function setup(options: { allowed?: boolean } = {}) {
  const fake = createFakeEventStore({ now: clock });
  const asked: string[] = [];
  const authorize = ((a: Actor | null, permission: string) => {
    asked.push(permission);
    if (!a) throw new Error("no actor");
    if (options.allowed === false) throw new AuthorizationError();
    return a;
  }) as Authorize;
  const consume = vi.fn(
    async (): Promise<{ allowed: boolean; retryAfter: number | null }> => ({
      allowed: true,
      retryAfter: null,
    })
  );
  const rateLimiter: RateLimiter = { consume };
  const observe = vi.fn();
  return {
    fake,
    asked,
    consume,
    observe,
    run: createCreateEvent({
      store: fake.store,
      authorize,
      rateLimiter,
      observe,
      now: clock,
    }),
  };
}

describe("createCreateEvent", () => {
  it("denies without event.create", async () => {
    const s = setup({ allowed: false });
    await expect(s.run({ actor, input: validInput })).rejects.toBeInstanceOf(
      AuthorizationError
    );
    expect(s.asked).toEqual([PERMISSIONS.EVENT_CREATE]);
  });

  it("maps a validation failure to VALIDATION_FAILED with field details", async () => {
    const s = setup();
    try {
      await s.run({ actor, input: { ...validInput, title: "ab" } });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: "title" })])
      );
    }
  });

  it("rate limits at events.create:<userId>", async () => {
    const s = setup();
    s.consume.mockResolvedValueOnce({ allowed: false, retryAfter: 42 });
    await expect(s.run({ actor, input: validInput })).rejects.toBeInstanceOf(
      RateLimitedError
    );
    expect(s.consume).toHaveBeenCalledWith(
      "events.create:organizer-1",
      CREATE_RATE
    );
  });

  it("writes the row and the event.created outbox entry in one transaction, then observes after commit", async () => {
    const s = setup();
    const result = await s.run({ actor, input: validInput });
    expect(result.eventId).toBeTruthy();

    const outbox = s.fake.events();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toEqual({
      type: "event.created",
      payload: { v: 1, eventId: result.eventId, actorId: "organizer-1" },
    });

    expect(s.observe).toHaveBeenCalledWith("created", result.eventId);
  });
});
