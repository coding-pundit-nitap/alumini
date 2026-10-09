import { describe, expect, it } from "vitest";

import { canTransition } from "./lifecycle";

describe("account lifecycle", () => {
  it.each([
    ["VERIFIED", "SUSPENDED", true],
    ["VERIFIED", "DEACTIVATED", true],
    ["SUSPENDED", "DEACTIVATED", true],
    ["SUSPENDED", "VERIFIED", true],
    ["DEACTIVATED", "VERIFIED", true],
    ["PENDING", "SUSPENDED", false],
    ["REJECTED", "DEACTIVATED", false],
    ["PENDING", "VERIFIED", false],
    ["SUSPENDED", "SUSPENDED", false],
    ["DEACTIVATED", "SUSPENDED", false],
    ["VERIFIED", "VERIFIED", false],
  ] as const)("%s → %s is %s", (from, to, ok) => {
    expect(canTransition(from, to)).toBe(ok);
  });
});
