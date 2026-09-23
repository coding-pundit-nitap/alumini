import { describe, expect, it } from "vitest";
import { PERMISSIONS, type Permission } from "@nitap/database/permissions";

import {
  ADMIN_PERMISSIONS,
  adminNavigation,
  dashboardTiles,
  hasAdminAccess,
} from "./access";

const holding =
  (...held: Permission[]) =>
  (p: Permission) =>
    held.includes(p);

describe("admin access", () => {
  it("is denied to a plain member", () => {
    const can = holding(PERMISSIONS.POST_CREATE, PERMISSIONS.REPORT_CREATE);
    expect(hasAdminAccess(can)).toBe(false);
    expect(adminNavigation(can)).toEqual([]);
    expect(dashboardTiles(can)).toEqual([]);
  });

  it("is denied when the only admin-tier grant is chapter-scoped (can() without a resource is false)", () => {
    expect(hasAdminAccess(holding())).toBe(false);
  });

  it("gives a moderator the dashboard with the report and members tiles, and no queue links", () => {
    const can = holding(PERMISSIONS.REPORT_REVIEW, PERMISSIONS.USER_READ_ADMIN);
    expect(hasAdminAccess(can)).toBe(true);
    expect(adminNavigation(can).map((i) => i.href)).toEqual(["/admin"]);
    expect(dashboardTiles(can)).toEqual(["openReports", "members"]);
  });

  it("links each queue only for its permission", () => {
    const can = holding(
      PERMISSIONS.AUDIT_READ,
      PERMISSIONS.ALUMNI_VERIFY,
      PERMISSIONS.JOB_APPROVE,
      PERMISSIONS.ACHIEVEMENT_REVIEW
    );
    expect(adminNavigation(can).map((i) => i.href)).toEqual([
      "/admin",
      "/admin/audit",
      "/admin/verification",
      "/jobs/moderation",
      "/achievements",
    ]);
  });

  it("lists every admin-tier permission exactly once", () => {
    expect(new Set(ADMIN_PERMISSIONS).size).toBe(ADMIN_PERMISSIONS.length);
    expect(ADMIN_PERMISSIONS).toHaveLength(12);
  });
});
