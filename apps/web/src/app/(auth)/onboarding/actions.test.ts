import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: new Headers({
    "x-request-id": "req-1",
    "x-forwarded-for": "203.0.113.5",
  }),
  getActor: vi.fn(),
  submit: vi.fn(),
  parse: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => mocks.headers }));
vi.mock("@/modules/auth", () => ({
  getActor: mocks.getActor,
  submitVerificationRequest: mocks.submit,
  parseEvidenceForm: mocks.parse,
}));

import { AuthorizationError, ValidationError } from "@/lib/errors";

import { submitVerificationAction } from "./actions";

const input = {
  rollNumber: "NITAP-2019-042",
  departmentId: "d",
  degreeId: "g",
  graduationYear: 2019,
  supportingInfo: null,
};

beforeEach(() => {
  mocks.getActor
    .mockReset()
    .mockResolvedValue({ userId: "u1", accountState: "PENDING" });
  mocks.submit.mockReset().mockResolvedValue({ requestId: "r1" });
  mocks.parse.mockReset().mockReturnValue(input);
});

describe("submitVerificationAction", () => {
  it("calls the use case with the session's actor, the client IP and the parsed evidence", async () => {
    const form = new FormData();

    const result = await submitVerificationAction(form);

    expect(result).toEqual({ ok: true, data: { requestId: "r1" } });
    expect(mocks.parse).toHaveBeenCalledWith(form);
    expect(mocks.submit).toHaveBeenCalledWith({
      actor: { userId: "u1", accountState: "PENDING" },
      clientIp: "203.0.113.5",
      input,
    });
  });

  it("returns per-field messages and never calls the use case for invalid input", async () => {
    mocks.parse.mockImplementation(() => {
      throw new ValidationError({
        details: [
          {
            field: "rollNumber",
            code: "INVALID",
            message: "Enter your roll number.",
          },
        ],
      });
    });

    const result = await submitVerificationAction(new FormData());

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        fields: { rollNumber: "Enter your roll number." },
      },
    });
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("maps a use-case failure to its code", async () => {
    mocks.submit.mockRejectedValue(
      new AuthorizationError({ code: "VERIFICATION_LOCKED" })
    );
    expect(await submitVerificationAction(new FormData())).toMatchObject({
      ok: false,
      error: { code: "VERIFICATION_LOCKED" },
    });
  });
});
