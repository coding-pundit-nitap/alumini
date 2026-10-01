import { describe, expect, it } from "vitest";

import { retentionInputSchema } from "./retention";

const audit = {
  defaultDays: 365,
  minDays: 365,
  maxDays: 3650,
  enforced: false,
};

describe("retentionInputSchema (12G G-3)", () => {
  it("applies the category's bounds", () => {
    const s = retentionInputSchema(audit);
    expect(s.safeParse({ retentionDays: 364 }).success).toBe(false);
    expect(s.safeParse({ retentionDays: 3651 }).success).toBe(false);
    expect(s.safeParse({ retentionDays: 400.5 }).success).toBe(false);
    expect(s.parse({ retentionDays: "730" })).toEqual({
      retentionDays: 730,
      approvedBy: null,
    });
  });

  it("trims the sign-off and turns blank into null", () => {
    const s = retentionInputSchema(audit);
    expect(
      s.parse({ retentionDays: 365, approvedBy: "  Registrar  " }).approvedBy
    ).toBe("Registrar");
    expect(s.parse({ retentionDays: 365, approvedBy: "   " }).approvedBy).toBe(
      null
    );
    expect(
      s.safeParse({ retentionDays: 365, approvedBy: "x".repeat(201) }).success
    ).toBe(false);
  });

  it("rejects unknown fields", () => {
    expect(
      retentionInputSchema(audit).safeParse({
        retentionDays: 365,
        category: "x",
      }).success
    ).toBe(false);
  });
});
