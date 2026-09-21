import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: new Headers({
    "x-request-id": "req-1",
    "x-forwarded-for": "203.0.113.5",
  }),
  getActor: vi.fn(),
  submit: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => mocks.headers }));
// The schemas are real; only the composed use case and getActor are replaced. Relative paths: a deep
// `@/modules/*/*` alias is forbidden by the boundary lint rule.
vi.mock("@/modules/auth", async () => {
  const schemas =
    await import("../../../modules/auth/presentation/api/verification-schemas");
  const forms = await import("../../../modules/auth/presentation/api/schemas");
  return {
    getActor: mocks.getActor,
    submitVerificationRequest: mocks.submit,
    EVIDENCE_FIELDS: schemas.EVIDENCE_FIELDS,
    evidenceSchema: schemas.evidenceSchema,
    validate: forms.validate,
  };
});

import { AuthorizationError } from "@/lib/errors";

import { submitVerificationAction } from "./actions";

const uuid = "11111111-1111-4111-8111-111111111111";
const form = (extra: Record<string, string> = {}) => {
  const data = new FormData();
  const fields = {
    rollNumber: "NITAP-2019-042",
    departmentId: uuid,
    degreeId: uuid,
    graduationYear: "2019",
    supportingInfo: "",
    ...extra,
  };
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

beforeEach(() => {
  mocks.getActor
    .mockReset()
    .mockResolvedValue({ userId: "u1", accountState: "PENDING" });
  mocks.submit.mockReset().mockResolvedValue({ requestId: "r1" });
});

describe("submitVerificationAction", () => {
  it("calls the use case with the caller, the client IP and the validated evidence", async () => {
    const result = await submitVerificationAction(form());

    expect(result).toEqual({ ok: true, data: { requestId: "r1" } });
    expect(mocks.submit).toHaveBeenCalledWith({
      actor: { userId: "u1", accountState: "PENDING" },
      clientIp: "203.0.113.5",
      input: {
        rollNumber: "NITAP-2019-042",
        departmentId: uuid,
        degreeId: uuid,
        graduationYear: 2019,
        supportingInfo: null,
      },
    });
  });

  it("ignores a forged userId or status field: they never reach the use case", async () => {
    await submitVerificationAction(
      form({ userId: "someone-else", status: "APPROVED", reviewedBy: "x" })
    );

    const input = mocks.submit.mock.calls[0]![0].input;
    expect(input).not.toHaveProperty("userId");
    expect(input).not.toHaveProperty("status");
    expect(mocks.submit.mock.calls[0]![0].actor.userId).toBe("u1");
  });

  it("returns per-field messages and does not call the use case for invalid input", async () => {
    const result = await submitVerificationAction(
      form({ graduationYear: "1999", rollNumber: "" })
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        fields: {
          graduationYear: expect.any(String),
          rollNumber: expect.any(String),
        },
      },
    });
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("maps a use-case failure to its code", async () => {
    mocks.submit.mockRejectedValue(
      new AuthorizationError({ code: "VERIFICATION_LOCKED" })
    );
    expect(await submitVerificationAction(form())).toMatchObject({
      ok: false,
      error: { code: "VERIFICATION_LOCKED" },
    });
  });
});
