import { describe, expect, it } from "vitest";

import { validate } from "./schemas";
import {
  decisionSchema,
  DECISION_FIELDS,
  EVIDENCE_FIELDS,
  evidenceSchema,
} from "./verification-schemas";

const uuid = "11111111-1111-4111-8111-111111111111";
const evidence = {
  rollNumber: "NITAP-2019-042",
  departmentId: uuid,
  degreeId: uuid,
  graduationYear: "2019",
  supportingInfo: "  Batch of 2019  ",
};

describe("evidenceSchema", () => {
  it("coerces the year, trims text and treats blank supporting information as none", () => {
    expect(validate(evidenceSchema, evidence)).toEqual({
      ok: true,
      data: {
        rollNumber: "NITAP-2019-042",
        departmentId: uuid,
        degreeId: uuid,
        graduationYear: 2019,
        supportingInfo: "Batch of 2019",
      },
    });
    const blank = validate(evidenceSchema, {
      ...evidence,
      supportingInfo: "  ",
    });
    expect(blank.ok && blank.data.supportingInfo).toBeNull();
  });

  it.each([
    ["rollNumber", { rollNumber: " " }],
    ["rollNumber", { rollNumber: "x".repeat(51) }],
    ["departmentId", { departmentId: "" }],
    ["departmentId", { departmentId: "not-a-uuid" }],
    ["degreeId", { degreeId: "" }],
    ["graduationYear", { graduationYear: "" }],
    ["graduationYear", { graduationYear: "2009" }],
    ["graduationYear", { graduationYear: "2101" }],
    ["graduationYear", { graduationYear: "20x9" }],
    ["supportingInfo", { supportingInfo: "x".repeat(2001) }],
  ])("reports %s for %j", (field, override) => {
    const result = validate(evidenceSchema, { ...evidence, ...override });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors)).toContain(field);
  });

  it("rejects a field it does not know, such as a forged userId", () => {
    expect(validate(evidenceSchema, { ...evidence, userId: uuid }).ok).toBe(
      false
    );
  });

  it("names exactly the fields the form may send", () => {
    expect([...EVIDENCE_FIELDS].sort()).toEqual(
      [
        "degreeId",
        "departmentId",
        "graduationYear",
        "rollNumber",
        "supportingInfo",
      ].sort()
    );
  });
});

describe("decisionSchema", () => {
  it("accepts an approval without a note and a rejection with one", () => {
    expect(
      validate(decisionSchema, { requestId: uuid, decision: "APPROVED" }).ok
    ).toBe(true);
    expect(
      validate(decisionSchema, {
        requestId: uuid,
        decision: "REJECTED",
        note: "No.",
      }).ok
    ).toBe(true);
  });

  it.each([
    [{ requestId: "nope", decision: "APPROVED" }],
    [{ requestId: uuid, decision: "AUTO_APPROVED" }],
    [{ requestId: uuid, decision: "APPROVED", reviewedBy: uuid }],
    [{ requestId: uuid, decision: "APPROVED", note: "x".repeat(1001) }],
  ])("rejects %j", (input) => {
    expect(validate(decisionSchema, input).ok).toBe(false);
  });

  it("names exactly the fields the form may send", () => {
    expect([...DECISION_FIELDS].sort()).toEqual([
      "decision",
      "note",
      "requestId",
    ]);
  });
});
