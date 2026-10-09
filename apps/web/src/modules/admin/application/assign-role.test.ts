import { describe, expect, it, vi } from "vitest";

import type { Actor } from "@/modules/auth";

import { fakeAccessStore } from "../../../../tests/support/fake-access-store";
import { createAssignRole } from "./assign-role";

const A = "00000000-0000-4000-8000-0000000000aa";
const T = "00000000-0000-4000-8000-0000000000bb";
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
} as const;

function setup(
  opts: {
    roles?: string[];
    targetGrants?: string[];
    targetExists?: boolean;
  } = {}
) {
  const fake = fakeAccessStore({
    users:
      opts.targetExists === false
        ? []
        : [{ id: T, accountState: "VERIFIED", roles: opts.roles ?? [] }],
  });
  const authorize = vi.fn((a: Actor | null) => a as Actor);
  const loadGrants = vi.fn(async () =>
    (opts.targetGrants ?? []).map((permission) => ({
      permission,
      scope: "GLOBAL" as const,
      expiresAt: null,
    }))
  );
  const assign = createAssignRole({
    store: fake.store,
    authorize,
    loadGrants,
    roles: ROLES,
    superAdminRole: "SUPER_ADMIN",
    now: () => now,
  });
  return { ...fake, authorize, loadGrants, assign };
}

describe("assignRole", () => {
  it("assigns STUDENT: authorizes role.assign with the subject, audits previousRoles", async () => {
    const s = setup({ roles: ["ALUMNI"] });
    await expect(
      s.assign({ actor: actor(), userId: T, input: { role: "STUDENT" } })
    ).resolves.toEqual({ roles: ["ALUMNI", "STUDENT"] });
    expect(s.authorize).toHaveBeenCalledWith(expect.anything(), "role.assign", {
      subjectUserId: T,
      concealed: true,
    });
    expect(s.audits[0]).toEqual({
      action: "role.assigned",
      actorId: A,
      targetUserId: T,
      metadata: { role: "STUDENT", previousRoles: ["ALUMNI"] },
    });
  });

  it.each(["OVERLORD", "constructor", "__proto__"])(
    "400s an unknown role %s with field 'role'",
    async (role) => {
      const s = setup();
      await expect(
        s.assign({ actor: actor(), userId: T, input: { role } })
      ).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
        details: [{ field: "role" }],
      });
    }
  );

  it("403s INSTITUTE_ADMIN without system.configure (E1) and never opens the transaction", async () => {
    const s = setup();
    await expect(
      s.assign({
        actor: actor(),
        userId: T,
        input: { role: "INSTITUTE_ADMIN" },
      })
    ).rejects.toMatchObject({ code: "ACCESS_ESCALATION_FORBIDDEN" });
    expect(s.calls).toEqual([]);
  });

  it("lets a system.configure holder assign INSTITUTE_ADMIN", async () => {
    const s = setup();
    await expect(
      s.assign({
        actor: actor(["system.configure"]),
        userId: T,
        input: { role: "INSTITUTE_ADMIN" },
      })
    ).resolves.toEqual({ roles: ["INSTITUTE_ADMIN"] });
  });

  it("409s ROLE_ALREADY_HELD", async () => {
    const s = setup({ roles: ["STUDENT"] });
    await expect(
      s.assign({ actor: actor(), userId: T, input: { role: "STUDENT" } })
    ).rejects.toMatchObject({ code: "ROLE_ALREADY_HELD" });
  });

  it("404s a missing user", async () => {
    const s = setup({ targetExists: false });
    await expect(
      s.assign({ actor: actor(), userId: T, input: { role: "STUDENT" } })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
