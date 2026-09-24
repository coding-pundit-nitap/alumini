import { describe, expect, it, vi } from "vitest";

import type { Actor } from "@/modules/auth";

import { fakeAccessStore } from "../../../../tests/support/fake-access-store";
import { createRevokeGrant } from "./revoke-grant";

const A = "00000000-0000-4000-8000-0000000000aa";
const T = "00000000-0000-4000-8000-0000000000bb";
const T2 = "00000000-0000-4000-8000-0000000000cc";
const CH = "00000000-0000-4000-8000-0000000000dd";
const G = "00000000-0000-4000-8000-0000000000e1";
const G_OTHER = "00000000-0000-4000-8000-0000000000e2";
const G_GLOBAL = "00000000-0000-4000-8000-0000000000e3";
const now = new Date("2026-09-24T12:00:00Z");

// An actor with role.assign can revoke any grant it also covers (bypasses CHAPTER_ONLY).
const roleManager = () =>
  ({
    userId: A,
    accountState: "VERIFIED",
    requestId: "r",
    grants: [
      { permission: "role.assign", scope: "GLOBAL" as const, expiresAt: null },
      { permission: "event.manage", scope: "GLOBAL" as const, expiresAt: null },
    ],
  }) as Actor;

// Coordinator: permission.grant + event.manage, both GLOBAL, no role.assign.
const coordinator = () =>
  ({
    userId: A,
    accountState: "VERIFIED",
    requestId: "r",
    grants: [
      {
        permission: "permission.grant",
        scope: "GLOBAL" as const,
        expiresAt: null,
      },
      { permission: "event.manage", scope: "GLOBAL" as const, expiresAt: null },
    ],
  }) as Actor;

function setup(
  opts: {
    grants?: {
      id: string;
      userId: string;
      permission: string;
      scope: "GLOBAL" | "CHAPTER";
      chapterId: string | null;
      expiresAt: Date | null;
    }[];
  } = {}
) {
  const fake = fakeAccessStore({
    users: [{ id: T, accountState: "VERIFIED", roles: [] }],
    grants: opts.grants as never,
  });
  const authorize = vi.fn((a: Actor | null) => a as Actor);
  const loadGrants = vi.fn(async () => []);
  const revoke = createRevokeGrant({
    store: fake.store,
    authorize,
    loadGrants,
    now: () => now,
  });
  return { ...fake, authorize, loadGrants, revoke };
}

describe("revokeGrant (spec B12-3, B12-9)", () => {
  it("revokes a chapter-scoped grant on T and audits the row", async () => {
    const s = setup({
      grants: [
        {
          id: G,
          userId: T,
          permission: "event.manage",
          scope: "CHAPTER",
          chapterId: CH,
          expiresAt: null,
        },
      ],
    });
    await s.revoke({ actor: roleManager(), userId: T, grantId: G });
    expect(s.grants).toEqual([]);
    expect(s.audits[0]).toEqual({
      action: "permission.revoked",
      actorId: A,
      targetUserId: T,
      metadata: {
        grantId: G,
        permission: "event.manage",
        scope: "CHAPTER",
        chapterId: CH,
        expiresAt: null,
      },
    });
  });

  it("404s a grantId belonging to another user", async () => {
    const s = setup({
      grants: [
        {
          id: G_OTHER,
          userId: T2,
          permission: "event.manage",
          scope: "CHAPTER",
          chapterId: CH,
          expiresAt: null,
        },
      ],
    });
    await expect(
      s.revoke({ actor: roleManager(), userId: T, grantId: G_OTHER })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("403s a Coordinator revoking a GLOBAL grant, checked against the stored grant", async () => {
    const s = setup({
      grants: [
        {
          id: G_GLOBAL,
          userId: T,
          permission: "event.manage",
          scope: "GLOBAL",
          chapterId: null,
          expiresAt: null,
        },
      ],
    });
    await expect(
      s.revoke({ actor: coordinator(), userId: T, grantId: G_GLOBAL })
    ).rejects.toMatchObject({ code: "ACCESS_ESCALATION_FORBIDDEN" });
    expect(s.calls).not.toContain("deleteGrant");
  });
});
