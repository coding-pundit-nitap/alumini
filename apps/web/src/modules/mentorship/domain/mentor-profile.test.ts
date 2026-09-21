import { describe, expect, it } from "vitest";

import { mentorProfileInput } from "./mentor-profile";

const base = { expertise: "  Databases " };

describe("mentorProfileInput", () => {
  it("trims, applies defaults, lower-cases and de-duplicates topics", () => {
    const parsed = mentorProfileInput.parse({
      ...base,
      topics: ["Rust", "rust ", "Career Advice"],
    });
    expect(parsed).toEqual({
      expertise: "Databases",
      topics: ["rust", "career advice"],
      availability: "",
      preferredContactMethod: "IN_APP",
      maxMentees: 3,
      accepting: true,
    });
  });

  it.each([
    ["empty expertise", { expertise: "  " }],
    ["long expertise", { expertise: "x".repeat(1001) }],
    ["long availability", { ...base, availability: "x".repeat(201) }],
    [
      "eleven topics",
      { ...base, topics: Array.from({ length: 11 }, (_, i) => `t${i}`) },
    ],
    ["empty topic", { ...base, topics: [" "] }],
    ["long topic", { ...base, topics: ["x".repeat(41)] }],
    ["max 0", { ...base, maxMentees: 0 }],
    ["max 21", { ...base, maxMentees: 21 }],
    ["fractional max", { ...base, maxMentees: 2.5 }],
    ["unknown contact method", { ...base, preferredContactMethod: "FAX" }],
    ["unknown field", { ...base, role: "ALUMNI" }],
  ])("rejects %s", (_, input) => {
    expect(mentorProfileInput.safeParse(input).success).toBe(false);
  });
});
