import { describe, expect, it } from "vitest";

import { PERMISSIONS as P } from "@nitap/database/permissions";

import {
  checkGrantChange,
  checkRoleChange,
  checkTarget,
  type HeldGrant,
} from "./escalation";

const now = new Date("2026-09-24T12:00:00Z");
const g = (permission: string, extra: Partial<HeldGrant> = {}): HeldGrant =>
  ({ permission, scope: "GLOBAL", expiresAt: null, ...extra }) as HeldGrant;
const CH = "00000000-0000-4000-8000-0000000000c1";
const CH2 = "00000000-0000-4000-8000-0000000000c2";

const instituteAdmin = [
  g(P.ROLE_ASSIGN),
  g(P.PERMISSION_GRANT),
  g(P.EVENT_MANAGE),
  g(P.POST_MODERATE),
];
const superAdmin = [...instituteAdmin, g(P.SYSTEM_CONFIGURE)];
const coordinator = [g(P.PERMISSION_GRANT), g(P.EVENT_MANAGE)];

describe("E1 role changes", () => {
  it("allows a non-admin role for an Institute Admin", () => {
    expect(
      checkRoleChange(instituteAdmin, [P.POST_CREATE], now)
    ).toBeUndefined();
  });
  it("refuses a role carrying role.assign without system.configure", () => {
    expect(checkRoleChange(instituteAdmin, [P.ROLE_ASSIGN], now)).toBe(
      "ADMIN_ROLE"
    );
  });
  it("lets a Super Admin assign an admin role", () => {
    expect(
      checkRoleChange(superAdmin, [P.ROLE_ASSIGN, P.SYSTEM_CONFIGURE], now)
    ).toBeUndefined();
  });
});

describe("E2 grant changes", () => {
  it("refuses a permission the actor does not hold", () => {
    expect(
      checkGrantChange(
        coordinator,
        { permission: P.POST_MODERATE, scope: "CHAPTER", chapterId: CH },
        now
      )
    ).toBe("NOT_HELD");
  });
  it("lets a Coordinator grant a held bundle permission in a chapter", () => {
    expect(
      checkGrantChange(
        coordinator,
        { permission: P.EVENT_MANAGE, scope: "CHAPTER", chapterId: CH },
        now
      )
    ).toBeUndefined();
  });
  it("refuses a GLOBAL grant from a Coordinator", () => {
    expect(
      checkGrantChange(
        coordinator,
        { permission: P.EVENT_MANAGE, scope: "GLOBAL", chapterId: null },
        now
      )
    ).toBe("CHAPTER_ONLY");
  });
  it("refuses a chapter-scoped holder granting GLOBAL or another chapter", () => {
    const scoped = [
      g(P.ROLE_ASSIGN),
      {
        permission: P.EVENT_MANAGE,
        scope: "CHAPTER",
        chapterId: CH,
        expiresAt: null,
      } as HeldGrant,
    ];
    expect(
      checkGrantChange(
        scoped,
        { permission: P.EVENT_MANAGE, scope: "GLOBAL", chapterId: null },
        now
      )
    ).toBe("NOT_HELD");
    expect(
      checkGrantChange(
        scoped,
        { permission: P.EVENT_MANAGE, scope: "CHAPTER", chapterId: CH2 },
        now
      )
    ).toBe("NOT_HELD");
    expect(
      checkGrantChange(
        scoped,
        { permission: P.EVENT_MANAGE, scope: "CHAPTER", chapterId: CH },
        now
      )
    ).toBeUndefined();
  });
  it("does not count an expired holding", () => {
    const expired = [g(P.ROLE_ASSIGN), g(P.EVENT_MANAGE, { expiresAt: now })];
    expect(
      checkGrantChange(
        expired,
        { permission: P.EVENT_MANAGE, scope: "GLOBAL", chapterId: null },
        now
      )
    ).toBe("NOT_HELD");
  });
  it("refuses a direct role.assign or system.configure grant without system.configure", () => {
    expect(
      checkGrantChange(
        instituteAdmin,
        { permission: P.ROLE_ASSIGN, scope: "GLOBAL", chapterId: null },
        now
      )
    ).toBe("ACCESS_ADMIN");
    expect(
      checkGrantChange(
        superAdmin,
        { permission: P.ROLE_ASSIGN, scope: "GLOBAL", chapterId: null },
        now
      )
    ).toBeUndefined();
  });
});

describe("E3 protected targets", () => {
  it("refuses an Institute Admin acting on a role.assign holder", () => {
    expect(checkTarget(instituteAdmin, [g(P.ROLE_ASSIGN)], now)).toBe(
      "PROTECTED_TARGET"
    );
  });
  it("allows a Super Admin", () => {
    expect(checkTarget(superAdmin, [g(P.ROLE_ASSIGN)], now)).toBeUndefined();
  });
  it("allows any target without role.assign", () => {
    expect(
      checkTarget(instituteAdmin, [g(P.PERMISSION_GRANT)], now)
    ).toBeUndefined();
  });
});
