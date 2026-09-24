import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: new Headers({ "x-request-id": "req-1" }),
  getActor: vi.fn(),
  parseProfile: vi.fn(),
  parsePrivacy: vi.fn(),
  updateProfile: vi.fn(),
  updatePrivacy: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => mocks.headers }));
vi.mock("@/modules/auth", () => ({ getActor: mocks.getActor }));
vi.mock("@/modules/users", () => ({
  parseProfileForm: mocks.parseProfile,
  parsePrivacyForm: mocks.parsePrivacy,
}));
vi.mock("@/composition/users", () => ({
  updateOwnProfile: mocks.updateProfile,
  updateOwnPrivacy: mocks.updatePrivacy,
}));

import { AuthorizationError, ValidationError } from "@/lib/errors";

import { updatePrivacyAction, updateProfileAction } from "./actions";

const actor = { userId: "u1", accountState: "PENDING" };
const profileInput = {
  fullName: "Asha",
  headline: null,
  bio: null,
  location: null,
};

beforeEach(() => {
  mocks.getActor.mockReset().mockResolvedValue(actor);
  mocks.parseProfile.mockReset().mockReturnValue(profileInput);
  mocks.parsePrivacy.mockReset().mockReturnValue({ visibility: "PUBLIC" });
  mocks.updateProfile.mockReset().mockResolvedValue(undefined);
  mocks.updatePrivacy.mockReset().mockResolvedValue(undefined);
});

describe("updateProfileAction", () => {
  it("calls the use case with the session's actor and the parsed input, and nothing else", async () => {
    const form = new FormData();
    form.set("userId", "someone-else"); // a forged field

    const result = await updateProfileAction(form);

    expect(result).toEqual({ ok: true, data: { saved: true } });
    expect(mocks.parseProfile).toHaveBeenCalledWith(form);
    expect(mocks.updateProfile).toHaveBeenCalledWith({
      actor,
      input: profileInput,
    });
  });

  it("returns per-field messages and never calls the use case for invalid input", async () => {
    mocks.parseProfile.mockImplementation(() => {
      throw new ValidationError({
        details: [
          { field: "fullName", code: "INVALID", message: "Enter your name." },
        ],
      });
    });
    const result = await updateProfileAction(new FormData());
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        fields: { fullName: "Enter your name." },
      },
    });
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });

  it("returns an error result when the use case denies the caller", async () => {
    mocks.updateProfile.mockRejectedValue(new AuthorizationError());
    expect(await updateProfileAction(new FormData())).toMatchObject({
      ok: false,
      error: { code: "PERMISSION_DENIED" },
    });
  });
});

describe("updatePrivacyAction", () => {
  it("calls the use case with the session's actor and the parsed settings", async () => {
    const result = await updatePrivacyAction(new FormData());
    expect(result).toEqual({ ok: true, data: { saved: true } });
    expect(mocks.updatePrivacy).toHaveBeenCalledWith({
      actor,
      input: { visibility: "PUBLIC" },
    });
  });
});
