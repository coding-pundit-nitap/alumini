import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: new Headers({ "x-request-id": "req-1" }),
  refresh: vi.fn(),
  getActor: vi.fn(),
  saveMentorProfile: vi.fn(),
  requestMentorship: vi.fn(),
  transitionMentorship: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => mocks.headers }));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
vi.mock("@/modules/auth", () => ({ getActor: mocks.getActor }));
vi.mock("@/composition/mentorship", () => ({
  saveMentorProfile: mocks.saveMentorProfile,
  requestMentorship: mocks.requestMentorship,
  transitionMentorship: mocks.transitionMentorship,
}));

import { AuthenticationError, ValidationError } from "@/lib/errors";

import {
  requestMentorshipAction,
  saveMentorProfileAction,
  transitionMentorshipAction,
} from "./actions";

const ID = "11111111-1111-4111-8111-111111111111";
const actor = { userId: "u1", accountState: "VERIFIED" };

beforeEach(() => {
  mocks.refresh.mockReset();
  mocks.getActor.mockReset().mockResolvedValue(actor);
  mocks.saveMentorProfile.mockReset().mockResolvedValue({ userId: "u1" });
  mocks.requestMentorship.mockReset().mockResolvedValue({ mentorshipId: ID });
  mocks.transitionMentorship
    .mockReset()
    .mockResolvedValue({ state: "ACCEPTED" });
});

describe("saveMentorProfileAction", () => {
  it("passes the session's actor and input to the use case, then refreshes the page", async () => {
    const input = { expertise: "DB" };
    expect(await saveMentorProfileAction(input)).toEqual({
      ok: true,
      data: { saved: true },
    });
    expect(mocks.saveMentorProfile).toHaveBeenCalledWith({ actor, input });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("returns { ok: false } with a safe message for a ValidationError, and does not refresh", async () => {
    mocks.saveMentorProfile.mockRejectedValue(
      new ValidationError({
        details: [{ field: "expertise", code: "INVALID", message: "Required" }],
      })
    );
    const result = await saveMentorProfileAction({});
    expect(result).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED" },
    });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("a signed-out caller gets UNAUTHENTICATED, never a crash", async () => {
    mocks.saveMentorProfile.mockRejectedValue(new AuthenticationError());
    expect(await saveMentorProfileAction({})).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });
  });
});

describe("requestMentorshipAction", () => {
  it("passes the actor, mentor id and input, then refreshes", async () => {
    const input = { message: "hi", topic: "sql" };
    expect(await requestMentorshipAction(ID, input)).toEqual({
      ok: true,
      data: { mentorshipId: ID },
    });
    expect(mocks.requestMentorship).toHaveBeenCalledWith({
      actor,
      mentorId: ID,
      input,
    });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it.each(["start", "complete"] as const)("accepts %s", async (action) => {
    expect(await transitionMentorshipAction(ID, action)).toMatchObject({
      ok: true,
    });
    expect(mocks.transitionMentorship).toHaveBeenCalledWith(
      expect.objectContaining({ action })
    );
  });

  it("refuses a malformed id without calling the use case", async () => {
    expect(
      await requestMentorshipAction("nope", { message: "hi" })
    ).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED" },
    });
    expect(mocks.requestMentorship).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

describe("transitionMentorshipAction", () => {
  it("passes the action and note, then refreshes", async () => {
    expect(await transitionMentorshipAction(ID, "decline", "busy")).toEqual({
      ok: true,
      data: { state: "ACCEPTED" },
    });
    expect(mocks.transitionMentorship).toHaveBeenCalledWith({
      actor,
      mentorshipId: ID,
      action: "decline",
      note: "busy",
    });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it.each(["start", "complete"] as const)("accepts %s", async (action) => {
    expect(await transitionMentorshipAction(ID, action)).toMatchObject({
      ok: true,
    });
    expect(mocks.transitionMentorship).toHaveBeenCalledWith(
      expect.objectContaining({ action })
    );
  });

  it("refuses a malformed id and an unknown action", async () => {
    expect(await transitionMentorshipAction("nope", "accept")).toMatchObject({
      ok: false,
    });
    expect(
      await transitionMentorshipAction(ID, "reopen" as unknown as "accept")
    ).toMatchObject({ ok: false });
    expect(mocks.transitionMentorship).not.toHaveBeenCalled();
  });
});
