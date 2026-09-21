import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: new Headers({ "x-request-id": "req-1" }),
  getActor: vi.fn(),
  decide: vi.fn(),
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
    decideVerificationRequest: mocks.decide,
    DECISION_FIELDS: schemas.DECISION_FIELDS,
    decisionSchema: schemas.decisionSchema,
    validate: forms.validate,
  };
});

import { AuthorizationError } from "@/lib/errors";

import { decideVerificationAction } from "./actions";

const id = "11111111-1111-4111-8111-111111111111";
const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

beforeEach(() => {
  mocks.getActor
    .mockReset()
    .mockResolvedValue({ userId: "rev", accountState: "VERIFIED" });
  mocks.decide.mockReset().mockResolvedValue({ outcome: "decided" });
});

describe("decideVerificationAction", () => {
  it("calls the use case with the caller and the validated decision", async () => {
    const result = await decideVerificationAction(
      form({ requestId: id, decision: "REJECTED", note: "Not found." })
    );

    expect(result).toEqual({ ok: true, data: { outcome: "decided" } });
    expect(mocks.decide).toHaveBeenCalledWith({
      actor: { userId: "rev", accountState: "VERIFIED" },
      requestId: id,
      decision: "REJECTED",
      note: "Not found.",
    });
  });

  it("ignores a forged reviewer or status field", async () => {
    await decideVerificationAction(
      form({
        requestId: id,
        decision: "APPROVED",
        reviewedBy: "someone",
        status: "APPROVED",
      })
    );
    expect(mocks.decide.mock.calls[0]![0]).not.toHaveProperty("reviewedBy");
    expect(mocks.decide.mock.calls[0]![0].actor.userId).toBe("rev");
  });

  it("refuses an unknown decision without calling the use case (there is no auto-approve value)", async () => {
    const result = await decideVerificationAction(
      form({ requestId: id, decision: "AUTO_APPROVED" })
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED" },
    });
    expect(mocks.decide).not.toHaveBeenCalled();
  });

  it("maps a self-review refusal to its code", async () => {
    mocks.decide.mockRejectedValue(
      new AuthorizationError({ code: "SELF_REVIEW_FORBIDDEN" })
    );
    expect(
      await decideVerificationAction(
        form({ requestId: id, decision: "APPROVED" })
      )
    ).toMatchObject({
      ok: false,
      error: { code: "SELF_REVIEW_FORBIDDEN" },
    });
  });
});
