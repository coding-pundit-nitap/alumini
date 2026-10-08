import { describe, expect, it } from "vitest";

import {
  ONBOARDING_ROLE_NAMES,
  ROLE_NAMES,
  VERIFIED_ALUMNI_ROLE,
} from "./role-permissions.ts";

describe("VERIFIED_ALUMNI_ROLE", () => {
  it("is a role that exists and is reachable through self-service onboarding", () => {
    expect(ROLE_NAMES).toContain(VERIFIED_ALUMNI_ROLE);
    expect(ONBOARDING_ROLE_NAMES).toContain(VERIFIED_ALUMNI_ROLE);
  });
});
