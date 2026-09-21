import { describe, expect, it } from "vitest";

import {
  ONBOARDING_ROLE_NAMES,
  ROLE_NAMES,
  ROLE_PERMISSIONS,
} from "./role-permissions.ts";

describe("ONBOARDING_ROLE_NAMES", () => {
  it("names only roles that exist", () => {
    for (const role of ONBOARDING_ROLE_NAMES) {
      expect(ROLE_NAMES).toContain(role);
    }
  });

  it("holds no role that can assign roles", () => {
    for (const role of ONBOARDING_ROLE_NAMES) {
      expect((ROLE_PERMISSIONS[role] as string[]).includes("role.assign")).toBe(
        false
      );
    }
  });
});
