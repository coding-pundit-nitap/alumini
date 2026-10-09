import { describe, expect, it } from "vitest";

import {
  acceptsPledges,
  campaignInputSchema,
  formatPaise,
  istToday,
  pledgeInputSchema,
  referenceInputSchema,
  rupeesToPaise,
} from "./donation";

describe("money", () => {
  it("parses rupees as typed into paise, rejecting anything else", () => {
    expect(rupeesToPaise("1,500")).toBe(150_000);
    expect(rupeesToPaise("₹ 99.5")).toBe(9_950);
    expect(rupeesToPaise(" 10.05 ")).toBe(1_005);
    expect(rupeesToPaise(2000)).toBe(200_000);
    for (const bad of ["", "abc", "1.234", "-5", "1e3", null])
      expect(rupeesToPaise(bad)).toBeNull();
  });

  it("formats with Indian grouping and paise only when present", () => {
    expect(formatPaise(10_000_000)).toBe("₹1,00,000");
    expect(formatPaise(150_050)).toBe("₹1,500.50");
  });

  it("bounds a pledge to ₹10 … ₹10,00,000", () => {
    expect(pledgeInputSchema.safeParse({ amount: "9.99" }).success).toBe(false);
    expect(pledgeInputSchema.safeParse({ amount: "10" }).success).toBe(true);
    expect(
      pledgeInputSchema.safeParse({ amount: "10,00,000.01" }).success
    ).toBe(false);
  });
});

describe("payment reference", () => {
  it("is upper-cased with whitespace removed, so a match ignores case and spacing", () => {
    expect(
      referenceInputSchema.parse({ paymentReference: " utr 4421 99ab " })
    ).toEqual({ paymentReference: "UTR442199AB" });
  });

  it("rejects symbols and lengths outside 4 … 64", () => {
    for (const bad of ["abc", "x".repeat(65), "UTR#1234"])
      expect(
        referenceInputSchema.safeParse({ paymentReference: bad }).success
      ).toBe(false);
  });

  it("is optional on a pledge; blank becomes null", () => {
    expect(
      pledgeInputSchema.parse({ amount: "50", paymentReference: "" })
    ).toEqual({ amount: 5_000, paymentReference: null });
  });
});

describe("campaign window", () => {
  const c = {
    status: "ACTIVE" as const,
    startsOn: "2026-10-01",
    endsOn: "2026-10-31",
  };

  it("uses the IST calendar day", () => {
    // 2026-09-30 19:00 UTC is 1 October 00:30 IST.
    expect(istToday(new Date("2026-09-30T19:00:00Z"))).toBe("2026-10-01");
  });

  it("accepts pledges only while ACTIVE and within the dates, inclusive", () => {
    expect(acceptsPledges(c, new Date("2026-09-30T19:00:00Z"))).toBe(true);
    expect(acceptsPledges(c, new Date("2026-09-30T18:00:00Z"))).toBe(false);
    expect(acceptsPledges(c, new Date("2026-10-31T18:00:00Z"))).toBe(true);
    expect(acceptsPledges(c, new Date("2026-10-31T18:31:00Z"))).toBe(false);
    expect(
      acceptsPledges(
        { ...c, status: "CLOSED" },
        new Date("2026-10-10T00:00:00Z")
      )
    ).toBe(false);
  });

  it("refuses an end date before the start", () => {
    const r = campaignInputSchema.safeParse({
      title: "Fund",
      description: "Ten chars at least",
      purpose: "Books",
      paymentInstructions: "UPI: fund@bank",
      startsOn: "2026-10-02",
      endsOn: "2026-10-01",
    });
    expect(r.success).toBe(false);
  });
});
