import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: new Headers({ "x-request-id": "req-1" }),
  getActor: vi.fn(),
  decide: vi.fn(),
  parse: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => mocks.headers }));
vi.mock("@/modules/auth", () => ({
  getActor: mocks.getActor,
  decideVerificationRequest: mocks.decide,
  parseDecisionForm: mocks.parse,
}));

import { AuthorizationError, ValidationError } from "@/lib/errors";

import { decideVerificationAction } from "./actions";

const id = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  mocks.getActor
    .mockReset()
    .mockResolvedValue({ userId: "rev", accountState: "VERIFIED" });
  mocks.decide.mockReset().mockResolvedValue({ outcome: "decided" });
  mocks.parse.mockReset().mockReturnValue({
    requestId: id,
    decision: "REJECTED",
    note: "Not found.",
  });
});

describe("decideVerificationAction", () => {
  it("calls the use case with the session's actor and the parsed decision, and nothing else", async () => {
    const result = await decideVerificationAction(new FormData());

    expect(result).toEqual({ ok: true, data: { outcome: "decided" } });
    expect(mocks.decide).toHaveBeenCalledWith({
      actor: { userId: "rev", accountState: "VERIFIED" },
      requestId: id,
      decision: "REJECTED",
      note: "Not found.",
    });
  });

  it("returns a validation failure without calling the use case (no auto-approve value exists)", async () => {
    mocks.parse.mockImplementation(() => {
      throw new ValidationError({
        details: [
          { field: "decision", code: "INVALID", message: "Invalid option" },
        ],
      });
    });

    expect(await decideVerificationAction(new FormData())).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED" },
    });
    expect(mocks.decide).not.toHaveBeenCalled();
  });

  it("maps a self-review refusal to its code", async () => {
    mocks.decide.mockRejectedValue(
      new AuthorizationError({ code: "SELF_REVIEW_FORBIDDEN" })
    );
    expect(await decideVerificationAction(new FormData())).toMatchObject({
      ok: false,
      error: { code: "SELF_REVIEW_FORBIDDEN" },
    });
  });
});
