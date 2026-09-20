import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headersRef: { current: new Headers() },
  getSession: vi.fn(),
  findRolePermissions: vi.fn(),
  findGrants: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () => mocks.headersRef.current,
}));
vi.mock("./auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/infrastructure/database/client", () => ({
  prisma: {
    rolePermission: { findMany: mocks.findRolePermissions },
    permissionGrant: { findMany: mocks.findGrants },
  },
}));

import { getActor } from "./actor";

beforeEach(() => {
  mocks.headersRef.current = new Headers({ "x-request-id": "req-abc" });
  mocks.getSession.mockReset();
  mocks.findRolePermissions.mockReset().mockResolvedValue([]);
  mocks.findGrants.mockReset().mockResolvedValue([]);
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
