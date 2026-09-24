import { describe, expect, it } from "vitest";

import { verifiedHome } from "./signed-in-redirect";

describe("verifiedHome", () => {
  it("returns null for null actor", () => {
    expect(verifiedHome(null)).toBe(null);
  });

  it.each(["PENDING", "REJECTED", "SUSPENDED", "DEACTIVATED"])(
    "returns null for %s account state",
    (accountState) => {
      expect(verifiedHome({ accountState })).toBe(null);
    }
  );

  it("returns /dashboard for VERIFIED account state", () => {
    expect(verifiedHome({ accountState: "VERIFIED" })).toBe("/dashboard");
  });
});
