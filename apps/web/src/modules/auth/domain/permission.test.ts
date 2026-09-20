import { describe, expect, it } from "vitest";

import { PERMISSIONS, isPermission } from "./permission";

describe("permission registry (domain view)", () => {
  it("exposes the shared registry", () => {
    expect(PERMISSIONS.ALUMNI_VERIFY).toBe("alumni.verify");
  });

  it("isPermission accepts registered names only", () => {
    expect(isPermission("alumni.verify")).toBe(true);
    expect(isPermission("alumni.verify ")).toBe(false);
    expect(isPermission("not.a.permission")).toBe(false);
    expect(isPermission("SUPER_ADMIN")).toBe(false);
  });
});
