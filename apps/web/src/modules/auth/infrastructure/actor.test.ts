import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headersRef: { current: new Headers() },
  getSession: vi.fn(),
  findRolePermissions: vi.fn(),
  findGrants: vi.fn(),
  findProfile: vi.fn(),
  provisionMember: vi.fn(),
  applyEmailVerification: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () => mocks.headersRef.current,
}));
vi.mock("./auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("./composition", () => ({
  provisionMember: mocks.provisionMember,
  applyEmailVerification: mocks.applyEmailVerification,
}));
vi.mock("@/infrastructure/database/client", () => ({
  prisma: {
    rolePermission: { findMany: mocks.findRolePermissions },
    permissionGrant: { findMany: mocks.findGrants },
    profile: { findUnique: mocks.findProfile },
  },
}));

import { getActor } from "./actor";

beforeEach(() => {
  mocks.headersRef.current = new Headers({ "x-request-id": "req-abc" });
  mocks.getSession.mockReset();
  mocks.findRolePermissions.mockReset().mockResolvedValue([]);
  mocks.findGrants.mockReset().mockResolvedValue([]);
  mocks.findProfile.mockReset().mockResolvedValue({ userId: "u1" });
  mocks.provisionMember.mockReset().mockResolvedValue({ created: true });
  mocks.applyEmailVerification
    .mockReset()
    .mockResolvedValue({ outcome: "unchanged" });
});

describe("getActor", () => {
  it("is null when signed out", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect(await getActor()).toBeNull();
  });

  it("builds a VERIFIED actor with its grants and the request id from the proxy header", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "u1", accountState: "VERIFIED" },
    });
    mocks.findRolePermissions.mockResolvedValue([
      { permission: "profile.read" },
    ]);
    mocks.findGrants.mockResolvedValue([
      {
        permission: "event.manage",
        scopeType: "CHAPTER",
        chapterId: "c1",
        expiresAt: null,
      },
    ]);

    expect(await getActor()).toEqual({
      userId: "u1",
      accountState: "VERIFIED",
      requestId: "req-abc",
      grants: [
        { permission: "profile.read", scope: "GLOBAL", expiresAt: null },
        {
          permission: "event.manage",
          scope: "CHAPTER",
          chapterId: "c1",
          expiresAt: null,
        },
      ],
    });
  });

  it("does not query grants for a SUSPENDED account", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "u1", accountState: "SUSPENDED" },
    });

    const actor = await getActor();

    expect(actor?.accountState).toBe("SUSPENDED");
    expect(actor?.grants).toEqual([]);
    expect(mocks.findRolePermissions).not.toHaveBeenCalled();
    expect(mocks.findGrants).not.toHaveBeenCalled();
  });

  it("falls back to an 'unknown' request id when the proxy header is absent", async () => {
    mocks.headersRef.current = new Headers();
    mocks.getSession.mockResolvedValue({
      user: { id: "u1", accountState: "PENDING" },
    });
    expect((await getActor())?.requestId).toBe("unknown");
  });
});

describe("getActor self-healing", () => {
  const session = (accountState: string) => ({
    user: { id: "u1", accountState },
  });

  it("creates a missing profile and carries on", async () => {
    mocks.getSession.mockResolvedValue(session("VERIFIED"));
    mocks.findProfile.mockResolvedValue(null);

    const actor = await getActor();

    expect(mocks.provisionMember).toHaveBeenCalledWith("u1");
    expect(actor?.accountState).toBe("VERIFIED");
  });

  it("does not provision when the profile exists", async () => {
    mocks.getSession.mockResolvedValue(session("VERIFIED"));

    await getActor();

    expect(mocks.provisionMember).not.toHaveBeenCalled();
  });

  it("does not re-apply verification for a VERIFIED account", async () => {
    mocks.getSession.mockResolvedValue(session("VERIFIED"));

    await getActor();

    expect(mocks.applyEmailVerification).not.toHaveBeenCalled();
  });

  it("re-applies verification for a PENDING account and returns the fresh VERIFIED actor with grants", async () => {
    mocks.getSession.mockResolvedValue(session("PENDING"));
    mocks.applyEmailVerification.mockResolvedValue({
      outcome: "verified",
      role: "ANY",
    });
    mocks.findRolePermissions.mockResolvedValue([
      { permission: "profile.read" },
    ]);

    const actor = await getActor();

    expect(mocks.applyEmailVerification).toHaveBeenCalledWith("u1");
    expect(actor?.accountState).toBe("VERIFIED");
    expect(actor?.grants.map((g) => g.permission)).toEqual(["profile.read"]);
  });

  it("keeps a PENDING actor when the account stays pending", async () => {
    mocks.getSession.mockResolvedValue(session("PENDING"));
    mocks.applyEmailVerification.mockResolvedValue({ outcome: "pending" });

    const actor = await getActor();

    expect(actor?.accountState).toBe("PENDING");
    expect(actor?.grants).toEqual([]);
  });

  it("never fails the request when a repair throws", async () => {
    mocks.getSession.mockResolvedValue(session("PENDING"));
    mocks.findProfile.mockResolvedValue(null);
    mocks.provisionMember.mockRejectedValue(new Error("db down"));
    mocks.applyEmailVerification.mockRejectedValue(new Error("db down"));

    const actor = await getActor();

    expect(actor?.accountState).toBe("PENDING");
  });
});
