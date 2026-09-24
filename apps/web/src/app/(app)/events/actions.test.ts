import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: new Headers({ "x-request-id": "req-1" }),
  getActor: vi.fn(),
  createEvent: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => mocks.headers }));
vi.mock("@/modules/auth", () => ({ getActor: mocks.getActor }));
vi.mock("@/composition/events", () => ({ createEvent: mocks.createEvent }));

import { AuthenticationError, ValidationError } from "@/lib/errors";

import { createEventAction } from "./actions";

const ID = "11111111-1111-4111-8111-111111111111";
const actor = { userId: "u1", accountState: "VERIFIED" };
const form = (over: Record<string, unknown> = {}) => ({
  title: "Reunion",
  description: "The annual alumni reunion.",
  startsLocal: "2026-10-01T18:00",
  deadlineLocal: "2026-09-30T18:00",
  timezone: "Asia/Kolkata",
  isOnline: false,
  location: "Main hall",
  capacity: 100,
  ...over,
});

beforeEach(() => {
  mocks.getActor.mockReset().mockResolvedValue(actor);
  mocks.createEvent.mockReset().mockResolvedValue({ eventId: ID });
});

describe("createEventAction", () => {
  it("converts both wall times in the chosen zone to UTC and passes the API shape to createEvent", async () => {
    expect(await createEventAction(form())).toEqual({
      ok: true,
      data: { eventId: ID },
    });
    expect(mocks.createEvent).toHaveBeenCalledWith({
      actor,
      input: {
        title: "Reunion",
        description: "The annual alumni reunion.",
        startsAt: "2026-10-01T12:30:00.000Z",
        registrationDeadline: "2026-09-30T12:30:00.000Z",
        timezone: "Asia/Kolkata",
        isOnline: false,
        location: "Main hall",
        capacity: 100,
      },
    });
  });

  it("sends an empty location as null", async () => {
    await createEventAction(form({ isOnline: true, location: "" }));
    expect(mocks.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ isOnline: true, location: null }),
      })
    );
  });

  it("an unknown zone is a field error on timezone, without calling the use case", async () => {
    const result = await createEventAction(form({ timezone: "Not/AZone" }));
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        fields: { timezone: expect.any(String) },
      },
    });
    expect(mocks.createEvent).not.toHaveBeenCalled();
  });

  it("malformed wall times are field errors on startsLocal and deadlineLocal", async () => {
    const result = await createEventAction(
      form({ startsLocal: "tomorrow", deadlineLocal: "2026-02-30T10:00" })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.error.fields ?? {}).sort()).toEqual([
        "deadlineLocal",
        "startsLocal",
      ]);
    }
    expect(mocks.createEvent).not.toHaveBeenCalled();
  });

  it("returns the use case's field details, and never crashes for a signed-out caller", async () => {
    mocks.createEvent.mockRejectedValueOnce(
      new ValidationError({
        details: [
          { field: "startsAt", code: "INVALID", message: "must be future" },
        ],
      })
    );
    expect(await createEventAction(form())).toMatchObject({
      ok: false,
      error: { fields: { startsAt: "must be future" } },
    });
    mocks.createEvent.mockRejectedValueOnce(new AuthenticationError());
    expect(await createEventAction(form())).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });
  });
});
