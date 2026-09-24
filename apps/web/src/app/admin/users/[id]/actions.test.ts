import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: new Headers({ "x-request-id": "req-1" }),
  getActor: vi.fn(),
  changeAccountState: vi.fn(),
  revokeGrant: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => mocks.headers }));
vi.mock("@/modules/auth", () => ({ getActor: mocks.getActor }));
vi.mock("@/composition/admin", () => ({
  changeAccountState: mocks.changeAccountState,
  revokeGrant: mocks.revokeGrant,
  assignRole: vi.fn(),
  revokeRole: vi.fn(),
  grantPermission: vi.fn(),
}));

import { changeAccountStateAction, revokeGrantAction } from "./actions";

const userId = "11111111-1111-4111-8111-111111111111";
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

beforeEach(() => {
  mocks.getActor.mockReset().mockResolvedValue({ userId: "admin" });
  mocks.changeAccountState
    .mockReset()
    .mockResolvedValue({ accountState: "SUSPENDED" });
  mocks.revokeGrant.mockReset().mockResolvedValue(undefined);
});

describe("user access actions", () => {
  it("passes the session's actor and only the named fields", async () => {
    const result = await changeAccountStateAction(
      form({
        userId,
        accountState: "SUSPENDED",
        reason: "SPAM",
        actorId: "someone-else",
      })
    );
    expect(result).toEqual({ ok: true, data: { accountState: "SUSPENDED" } });
    expect(mocks.changeAccountState).toHaveBeenCalledWith({
      actor: { userId: "admin" },
      userId,
      input: { accountState: "SUSPENDED", reason: "SPAM" },
    });
  });

  it("answers NOT_FOUND for a malformed id without calling the use case", async () => {
    expect(
      await revokeGrantAction(form({ userId, grantId: "1; drop" }))
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(mocks.revokeGrant).not.toHaveBeenCalled();
  });
});
