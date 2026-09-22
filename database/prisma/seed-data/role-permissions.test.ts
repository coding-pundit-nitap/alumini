import { describe, expect, it } from "vitest";

import { PERMISSIONS } from "./permissions";
import {
  ROLE_NAMES,
  ROLE_PERMISSIONS,
  type RoleName,
} from "./role-permissions";

const ALL_PERMISSIONS = new Set(Object.values(PERMISSIONS));

describe("permission registry and RBAC matrix (rbac-permission-matrix.md §3-4)", () => {
  it("has a bundle for every seeded role", () => {
    for (const role of ROLE_NAMES) {
      expect(ROLE_PERMISSIONS[role]).toBeDefined();
      expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
    }
  });

  it("never seeds a permission that isn't in the registry (drift)", () => {
    for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) {
      for (const permission of permissions) {
        expect(ALL_PERMISSIONS, `${role} → ${permission}`).toContain(
          permission
        );
      }
    }
  });

  it("every registered permission is granted to at least one role", () => {
    const granted = new Set(Object.values(ROLE_PERMISSIONS).flat());
    for (const permission of ALL_PERMISSIONS) {
      expect(granted, permission).toContain(permission);
    }
  });

  it("SUPER_ADMIN holds every permission except the alumni/student-specific member actions", () => {
    const superAdmin = new Set(ROLE_PERMISSIONS.SUPER_ADMIN);
    const memberSpecific = new Set([
      PERMISSIONS.MENTOR_OPT_IN,
      PERMISSIONS.MENTORSHIP_REQUEST,
      PERMISSIONS.MENTORSHIP_RESPOND,
      PERMISSIONS.ACHIEVEMENT_SUBMIT,
    ]);
    for (const permission of ALL_PERMISSIONS) {
      if (memberSpecific.has(permission)) {
        expect(superAdmin, permission).not.toContain(permission);
      } else {
        expect(superAdmin, permission).toContain(permission);
      }
    }
  });

  it("has no duplicate permission within a role's bundle", () => {
    for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) {
      expect(new Set(permissions).size, role).toBe(permissions.length);
    }
  });

  it("job.* bundle matches rbac-permission-matrix.md rows 75-78, 148-151 (spec J-14)", () => {
    const has = (role: RoleName, permission: string) =>
      ROLE_PERMISSIONS[role].includes(permission as never);

    for (const role of ROLE_NAMES) {
      expect(has(role, PERMISSIONS.JOB_READ), role).toBe(true);
    }
    for (const role of [
      "ALUMNI",
      "TP_ADMIN",
      "INSTITUTE_ADMIN",
      "SUPER_ADMIN",
    ] as const) {
      expect(has(role, PERMISSIONS.JOB_CREATE), role).toBe(true);
    }
    for (const role of [
      "STUDENT",
      "FACULTY",
      "STAFF",
      "MODERATOR",
      "ALUMNI_COORDINATOR",
    ] as const) {
      expect(has(role, PERMISSIONS.JOB_CREATE), role).toBe(false);
    }
    for (const role of [
      "TP_ADMIN",
      "INSTITUTE_ADMIN",
      "SUPER_ADMIN",
    ] as const) {
      expect(has(role, PERMISSIONS.JOB_APPROVE), role).toBe(true);
      expect(has(role, PERMISSIONS.JOB_MANAGE), role).toBe(true);
    }
    expect(has("ALUMNI", PERMISSIONS.JOB_APPROVE)).toBe(false);
  });
});
