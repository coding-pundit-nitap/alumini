import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/errors";

import { parseDecisionForm, parseEvidenceForm } from "./verification-forms";

const uuid = "11111111-1111-4111-8111-111111111111";
const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};
const evidence = {
  rollNumber: "NITAP-2019-042",
  departmentId: uuid,
  degreeId: uuid,
  graduationYear: "2019",
  supportingInfo: "",
};

describe("parseEvidenceForm", () => {
  it("returns the validated evidence", () => {
    expect(parseEvidenceForm(form(evidence))).toEqual({
      rollNumber: "NITAP-2019-042",
      departmentId: uuid,
      degreeId: uuid,
      graduationYear: 2019,
      supportingInfo: null,
    });
  });

  it("ignores a forged userId or status and the fields the framework adds", () => {
    const parsed = parseEvidenceForm(
      form({
        ...evidence,
        userId: "someone-else",
        status: "APPROVED",
        $ACTION_ID_x: "y",
      })
    );
    expect(parsed).not.toHaveProperty("userId");
    expect(parsed).not.toHaveProperty("status");
  });

  it("throws a ValidationError naming each bad field", () => {
    try {
      parseEvidenceForm(
        form({ ...evidence, graduationYear: "1999", rollNumber: "" })
      );
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      const fields = (error as ValidationError).details as { field: string }[];
      expect(fields.map((d) => d.field).sort()).toEqual([
        "graduationYear",
        "rollNumber",
      ]);
    }
  });
});

describe("parseDecisionForm", () => {
  it("returns the validated decision", () => {
    expect(
      parseDecisionForm(
        form({ requestId: uuid, decision: "REJECTED", note: "Not found." })
      )
    ).toEqual({
      requestId: uuid,
      decision: "REJECTED",
      note: "Not found.",
    });
  });

  it("ignores a forged reviewer and has no auto-approve value", () => {
    expect(
      parseDecisionForm(
        form({ requestId: uuid, decision: "APPROVED", reviewedBy: "x" })
      )
    ).not.toHaveProperty("reviewedBy");
    expect(() =>
      parseDecisionForm(form({ requestId: uuid, decision: "AUTO_APPROVED" }))
    ).toThrow(ValidationError);
  });
});
