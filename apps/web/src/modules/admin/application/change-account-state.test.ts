import { describe, expect, it, vi } from "vitest";

import { AuthorizationError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { fakeAccessStore } from "../../../../tests/support/fake-access-store";
import { createChangeAccountState } from "./change-account-state";

const A = "00000000-0000-4000-8000-0000000000aa";
const T = "00000000-0000-4000-8000-0000000000bb";
const now = new Date("2026-09-24T12:00:00Z");
const actor = (extra: string[] = []) =>
  ({
    userId: A,
    accountState: "VERIFIED",
    requestId: "r",
    grants: ["user.suspend", "user.reactivate", ...extra].map((permission) => ({
      permission,
      scope: "GLOBAL",
      expiresAt: null,
    })),
  }) as Actor;

function setup(
  state = "VERIFIED",
  opts: {
    roles?: string[];
    superAdmins?: string[];
    targetGrants?: string[];
  } = {}
) {
  const fake = fakeAccessStore({
    users: [{ id: T, accountState: state as never, roles: opts.roles ?? [] }],
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
  const change = createChangeAccountState({
    store: fake.store,
    authorize,
    loadGrants,
    superAdminRole: "SUPER_ADMIN",
    now: () => now,
  });
  return { ...fake, authorize, change };
}

describe("changeAccountState (spec B12-1, B12-5, B12-6)", () => {
  it("suspends: picks user.suspend, revokes sessions, audits the reason code", async () => {
    const s = setup();
    await expect(
      s.change({
        actor: actor(),
        userId: T,
        input: { accountState: "SUSPENDED", reason: "SPAM" },
      })
    ).resolves.toEqual({ accountState: "SUSPENDED" });
    expect(s.authorize).toHaveBeenCalledWith(
      expect.anything(),
      "user.suspend",
      { subjectUserId: T, concealed: true }
    );
    expect(s.calls).toEqual([
      "findUserForUpdate",
      "setAccountState",
      "deleteSessions",
      "audit",
    ]);
    expect(s.audits[0]).toEqual({
      action: "user.suspended",
      actorId: A,
      targetUserId: T,
      metadata: {
        reason: "SPAM",
        previousState: "VERIFIED",
        sessionsRevoked: 1,
      },
    });
  });
  it("reactivates: picks user.reactivate, keeps sessions", async () => {
    const s = setup("SUSPENDED");
    await s.change({
      actor: actor(),
      userId: T,
      input: { accountState: "VERIFIED" },
    });
    expect(s.authorize).toHaveBeenCalledWith(
      expect.anything(),
      "user.reactivate",
      expect.anything()
    );
    expect(s.calls).not.toContain("deleteSessions");
    expect(s.audits[0]?.action).toBe("user.reactivated");
  });
  it("deactivates a suspended account", async () => {
    const s = setup("SUSPENDED");
    await s.change({
      actor: actor(),
      userId: T,
      input: { accountState: "DEACTIVATED", reason: "OTHER" },
    });
    expect(s.users.get(T)?.accountState).toBe("DEACTIVATED");
  });
  it("409s an invalid transition with details", async () => {
    await expect(
      setup("PENDING").change({
        actor: actor(),
        userId: T,
        input: { accountState: "SUSPENDED", reason: "SPAM" },
      })
    ).rejects.toMatchObject({
      code: "INVALID_STATE_TRANSITION",
      details: [{ currentState: "PENDING", requestedState: "SUSPENDED" }],
    });
  });
  it("refuses to suspend the last active super admin", async () => {
    const s = setup("VERIFIED", {
      roles: ["SUPER_ADMIN"],
      superAdmins: [T],
      targetGrants: [],
    });
    await expect(
      s.change({
        actor: actor(["system.configure"]),
        userId: T,
        input: { accountState: "SUSPENDED", reason: "SECURITY" },
      })
    ).rejects.toMatchObject({ code: "LAST_SUPER_ADMIN" });
    expect(s.calls).not.toContain("setAccountState");
  });
  it("refuses an Institute Admin acting on a role.assign holder (E3) before the transaction", async () => {
    const s = setup("VERIFIED", { targetGrants: ["role.assign"] });
    await expect(
      s.change({
        actor: actor(),
        userId: T,
        input: { accountState: "SUSPENDED", reason: "SPAM" },
      })
    ).rejects.toMatchObject({ code: "ACCESS_ESCALATION_FORBIDDEN" });
    expect(s.calls).toEqual([]);
  });
  it("400s a missing reason after authorizing", async () => {
    const s = setup();
    await expect(
      s.change({
        actor: actor(),
        userId: T,
        input: { accountState: "SUSPENDED" },
      })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(s.authorize).toHaveBeenCalled();
  });
  it("propagates the authorization error and touches nothing", async () => {
    const s = setup();
    s.authorize.mockImplementation(() => {
      throw new AuthorizationError({ hideExistence: true });
    });
    await expect(
      s.change({
        actor: actor(),
        userId: T,
        input: { accountState: "SUSPENDED", reason: "SPAM" },
      })
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(s.calls).toEqual([]);
  });
});
