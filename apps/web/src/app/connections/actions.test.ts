import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: new Headers({ "x-request-id": "req-1" }),
  refresh: vi.fn(),
  getActor: vi.fn(),
  requestConnection: vi.fn(),
  respondToConnection: vi.fn(),
  removeConnection: vi.fn(),
  blockUser: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => mocks.headers }));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
vi.mock("@/modules/auth", () => ({ getActor: mocks.getActor }));
vi.mock("@/composition/connections", () => ({
  requestConnection: mocks.requestConnection,
  respondToConnection: mocks.respondToConnection,
  removeConnection: mocks.removeConnection,
  blockUser: mocks.blockUser,
}));

import { AuthenticationError, ConflictError } from "@/lib/errors";

import {
  blockUserAction,
  removeConnectionAction,
  requestConnectionAction,
  respondToConnectionAction,
} from "./actions";

const actor = { userId: "u1", accountState: "VERIFIED" };
const id = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  mocks.refresh.mockReset();
  mocks.getActor.mockReset().mockResolvedValue(actor);
  mocks.requestConnection.mockReset().mockResolvedValue({ connectionId: id });
  mocks.respondToConnection
    .mockReset()
    .mockResolvedValue({ state: "ACCEPTED" });
  mocks.removeConnection.mockReset().mockResolvedValue({ outcome: "removed" });
  mocks.blockUser.mockReset().mockResolvedValue({ connectionId: id });
});

describe("connection Server Actions", () => {
  it("pass the session's actor and the id to the use case, then refresh the page", async () => {
    expect(await requestConnectionAction(id)).toEqual({
      ok: true,
      data: { connectionId: id },
    });
    expect(mocks.requestConnection).toHaveBeenCalledWith({
      actor,
      recipientId: id,
    });

    expect(await respondToConnectionAction(id, "REJECT")).toMatchObject({
      ok: true,
    });
    expect(mocks.respondToConnection).toHaveBeenCalledWith({
      actor,
      connectionId: id,
      decision: "REJECT",
    });

    expect(await removeConnectionAction(id)).toMatchObject({ ok: true });
    expect(mocks.removeConnection).toHaveBeenCalledWith({
      actor,
      connectionId: id,
    });

    expect(await blockUserAction(id)).toMatchObject({ ok: true });
    expect(mocks.blockUser).toHaveBeenCalledWith({ actor, targetUserId: id });
    expect(mocks.refresh).toHaveBeenCalledTimes(4);
  });

  it.each([
    [
      "request",
      () => requestConnectionAction("nope"),
      () => mocks.requestConnection,
    ],
    [
      "respond",
      () => respondToConnectionAction("nope", "ACCEPT"),
      () => mocks.respondToConnection,
    ],
    [
      "remove",
      () => removeConnectionAction("nope"),
      () => mocks.removeConnection,
    ],
    ["block", () => blockUserAction("nope"), () => mocks.blockUser],
  ])(
    "%s: a malformed id is a validation error and never reaches the use case",
    async (_n, call, useCase) => {
      const result = await call();
      expect(result).toMatchObject({
        ok: false,
        error: { code: "VALIDATION_FAILED" },
      });
      expect(useCase()).not.toHaveBeenCalled();
      expect(mocks.refresh).not.toHaveBeenCalled();
    }
  );

  it("respond refuses a decision other than ACCEPT or REJECT", async () => {
    const result = await respondToConnectionAction(id, "BLOCK" as never);
    expect(result).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED" },
    });
    expect(mocks.respondToConnection).not.toHaveBeenCalled();
  });

  it("returns a use case's refusal as a safe result (code and catalogue message) and does not refresh", async () => {
    mocks.requestConnection.mockRejectedValue(
      new ConflictError("CONNECTION_COOLDOWN", {
        details: [{ eligibleAt: "2026-10-01T00:00:00.000Z" }],
      })
    );
    const result = await requestConnectionAction(id);
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "CONNECTION_COOLDOWN",
        message: expect.stringContaining("again later"),
      },
      requestId: expect.any(String),
    });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("a signed-out caller gets UNAUTHENTICATED, never a crash", async () => {
    mocks.requestConnection.mockRejectedValue(new AuthenticationError());
    expect(await requestConnectionAction(id)).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });
  });

  it("an unexpected failure is the generic message, not the raw error", async () => {
    mocks.blockUser.mockRejectedValue(
      new Error("connection string postgres://secret")
    );
    const result = await blockUserAction(id);
    expect(result).toMatchObject({
      ok: false,
      error: { code: "INTERNAL_ERROR" },
    });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});
