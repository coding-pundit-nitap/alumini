import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: new Headers({ "x-request-id": "req-1" }),
  refresh: vi.fn(),
  getActor: vi.fn(),
  saveMentorProfile: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => mocks.headers }));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
vi.mock("@/modules/auth", () => ({ getActor: mocks.getActor }));
vi.mock("@/composition/mentorship", () => ({
  saveMentorProfile: mocks.saveMentorProfile,
}));

import { AuthenticationError, ValidationError } from "@/lib/errors";

import { saveMentorProfileAction } from "./actions";

const actor = { userId: "u1", accountState: "VERIFIED" };

beforeEach(() => {
  mocks.refresh.mockReset();
  mocks.getActor.mockReset().mockResolvedValue(actor);
  mocks.saveMentorProfile.mockReset().mockResolvedValue({ userId: "u1" });
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
