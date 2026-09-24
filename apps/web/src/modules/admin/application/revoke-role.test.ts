import { describe, expect, it, vi } from "vitest";

import type { Actor } from "@/modules/auth";

import { fakeAccessStore } from "../../../../tests/support/fake-access-store";
import { createRevokeRole } from "./revoke-role";

const A = "00000000-0000-4000-8000-0000000000aa";
const T = "00000000-0000-4000-8000-0000000000bb";
const T2 = "00000000-0000-4000-8000-0000000000cc";
const now = new Date("2026-09-24T12:00:00Z");

const actor = (extra: string[] = []) =>
  ({
    userId: A,
    accountState: "VERIFIED",
    requestId: "r",
    grants: extra.map((permission) => ({
      permission,
      scope: "GLOBAL" as const,
      expiresAt: null,
    })),
  }) as Actor;

const ROLES = {
  STUDENT: [],
  ALUMNI: [],
  INSTITUTE_ADMIN: ["role.assign", "permission.grant"],
  SUPER_ADMIN: ["role.assign", "permission.grant", "system.configure"],
} as const;

function setup(
  opts: {
    roles?: string[];
    superAdmins?: string[];
    targetGrants?: string[];
  } = {}
) {
  const fake = fakeAccessStore({
    users: [
      { id: T, accountState: "VERIFIED", roles: opts.roles ?? [] },
      ...(opts.superAdmins?.includes(T2)
        ? [
            {
              id: T2,
              accountState: "VERIFIED" as const,
              roles: ["SUPER_ADMIN"],
            },
          ]
        : []),
    ],
    superAdmins: opts.superAdmins,
  });
  const authorize = vi.fn((a: Actor | null) => a as Actor);
  const loadGrants = vi.fn(async () =>
    (opts.targetGrants ?? []).map((permission) => ({
      permission,
      scope: "GLOBAL" as const,
      expiresAt: null,
    }))
  );
  const revoke = createRevokeRole({
    store: fake.store,
    authorize,
    loadGrants,
    roles: ROLES,
    superAdminRole: "SUPER_ADMIN",
    now: () => now,
  });
  return { ...fake, authorize, loadGrants, revoke };
}

describe("revokeRole (spec B12-3, B12-5, B12-9)", () => {
  it("revoking a held role audits and returns the remaining roles", async () => {
    const s = setup({ roles: ["ALUMNI", "STUDENT"] });
    await expect(
      s.revoke({ actor: actor(), userId: T, role: "STUDENT" })
    ).resolves.toEqual({ roles: ["ALUMNI"] });
    expect(s.audits[0]).toEqual({
      action: "role.revoked",
      actorId: A,
      targetUserId: T,
      metadata: { role: "STUDENT", previousRoles: ["ALUMNI", "STUDENT"] },
    });
  });

  it("revoking a role not held returns NotFoundError", async () => {
    const s = setup({ roles: ["ALUMNI"] });
    await expect(
      s.revoke({ actor: actor(), userId: T, role: "STUDENT" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("revoking SUPER_ADMIN from the only active super admin returns LAST_SUPER_ADMIN and does not delete", async () => {
    const s = setup({
      roles: ["SUPER_ADMIN"],
      superAdmins: [T],
    });
    await expect(
      s.revoke({
        actor: actor(["system.configure"]),
        userId: T,
        role: "SUPER_ADMIN",
      })
    ).rejects.toMatchObject({ code: "LAST_SUPER_ADMIN" });
    expect(s.calls).not.toContain("deleteUserRole");
  });

  it("revoking SUPER_ADMIN when two are active locks then deletes", async () => {
    const s = setup({
      roles: ["SUPER_ADMIN"],
      superAdmins: [T, T2],
    });
    await expect(
      s.revoke({
        actor: actor(["system.configure"]),
        userId: T,
        role: "SUPER_ADMIN",
      })
    ).resolves.toEqual({ roles: [] });
    const lockIdx = s.calls.indexOf("lockSuperAdmins");
    const deleteIdx = s.calls.indexOf("deleteUserRole");
    expect(lockIdx).toBeGreaterThanOrEqual(0);
    expect(deleteIdx).toBeGreaterThan(lockIdx);
  });

  it("revoking INSTITUTE_ADMIN as an Institute Admin is ACCESS_ESCALATION_FORBIDDEN", async () => {
    const s = setup({ roles: ["INSTITUTE_ADMIN"] });
    await expect(
      s.revoke({
        actor: actor(["role.assign", "permission.grant"]),
        userId: T,
        role: "INSTITUTE_ADMIN",
      })
    ).rejects.toMatchObject({ code: "ACCESS_ESCALATION_FORBIDDEN" });
  });
});
