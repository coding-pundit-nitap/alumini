import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActor: vi.fn(),
  requestConnection: vi.fn(),
  respondToConnection: vi.fn(),
  removeConnection: vi.fn(),
  blockUser: vi.fn(),
  listConnections: vi.fn(),
}));
vi.mock("@/config/env", () => ({
  env: { BETTER_AUTH_URL: "https://alumni.example.test" },
}));
vi.mock("@/modules/auth", () => ({ getActor: mocks.getActor }));
vi.mock("@/composition/connections", () => mocks);
// The key-handling itself is tested in infrastructure/idempotency; here the work simply runs.
vi.mock("@/infrastructure/idempotency", () => ({
  respondIdempotently: async (
    _request: Request,
    args: {
      execute: () => Promise<{
        status: number;
        body: unknown;
        headers: Record<string, string>;
      }>;
    }
  ) => {
    const r = await args.execute();
    return Response.json(r.body, { status: r.status, headers: r.headers });
  },
}));

import { AuthenticationError, NotFoundError } from "@/lib/errors";

import { POST as block } from "../blocks/route";
import { DELETE, PATCH } from "./[id]/route";
import { GET, POST } from "./route";

const id = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const ORIGIN = "https://alumni.example.test";

const json = (method: string, body: unknown, origin: string | null = ORIGIN) =>
  new Request("https://alumni.example.test/api/v1/connections", {
    method,
    headers: {
      "content-type": "application/json",
      ...(origin ? { origin } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const ctx = (value: string) => ({ params: Promise.resolve({ id: value }) });

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.getActor.mockResolvedValue({ userId: "u1" });
  mocks.requestConnection.mockResolvedValue({ connectionId: id });
  mocks.respondToConnection.mockResolvedValue({ state: "ACCEPTED" });
  mocks.removeConnection.mockResolvedValue({ outcome: "removed" });
  mocks.blockUser.mockResolvedValue({ connectionId: id });
  mocks.listConnections.mockResolvedValue({
    data: [],
    page: { limit: 20, nextCursor: null, hasMore: false },
  });
});

describe("POST /api/v1/connections", () => {
  it("creates: 201 with a Location header, calling the use case with the session's actor", async () => {
    const res = await POST(json("POST", { recipientId: other }));
    expect(res.status).toBe(201);
    expect(res.headers.get("location")).toBe(`/api/v1/connections/${id}`);
    expect(await res.json()).toEqual({
      data: { id, state: "PENDING", direction: "OUTGOING" },
    });
    expect(mocks.requestConnection).toHaveBeenCalledWith({
      actor: { userId: "u1" },
      recipientId: other,
    });
  });

  it.each([
    [
      "a foreign Origin (CSRF)",
      () => json("POST", { recipientId: other }, "https://evil.example.test"),
      403,
      "ORIGIN_NOT_ALLOWED",
    ],
    [
      "a body that is not JSON",
      () => json("POST", "{oops"),
      400,
      "MALFORMED_REQUEST",
    ],
    ["a missing recipientId", () => json("POST", {}), 400, "VALIDATION_FAILED"],
    [
      "a recipientId that is not a UUID",
      () => json("POST", { recipientId: "x" }),
      400,
      "VALIDATION_FAILED",
    ],
    [
      "an unexpected extra field",
      () => json("POST", { recipientId: other, admin: true }),
      400,
      "VALIDATION_FAILED",
    ],
  ])(
    "refuses %s before touching the use case",
    async (_l, request, status, code) => {
      const res = await POST(request());
      expect(res.status).toBe(status);
      expect((await res.json()).error.code).toBe(code);
      expect(mocks.requestConnection).not.toHaveBeenCalled();
    }
  );

  it("maps a signed-out caller to 401", async () => {
    mocks.requestConnection.mockRejectedValue(new AuthenticationError());
    expect((await POST(json("POST", { recipientId: other }))).status).toBe(401);
  });
});

describe("GET /api/v1/connections", () => {
  it("lists with defaults and never caches", async () => {
    const res = await GET(
      new Request("https://alumni.example.test/api/v1/connections")
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.listConnections).toHaveBeenCalledWith({
      actor: { userId: "u1" },
      state: "ACCEPTED",
    });
  });

  it("refuses REJECTED (not listable) and out-of-range limits", async () => {
    for (const q of [
      "state=REJECTED",
      "limit=0",
      "limit=500",
      "direction=SIDEWAYS",
    ]) {
      const res = await GET(
        new Request(`https://alumni.example.test/api/v1/connections?${q}`)
      );
      expect(res.status, q).toBe(400);
    }
    expect(mocks.listConnections).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/v1/connections/:id", () => {
  it("accepts or rejects, mapping the state to the use case's decision", async () => {
    expect(
      (await PATCH(json("PATCH", { state: "ACCEPTED" }), ctx(id))).status
    ).toBe(200);
    expect(mocks.respondToConnection).toHaveBeenCalledWith({
      actor: { userId: "u1" },
      connectionId: id,
      decision: "ACCEPT",
    });
    await PATCH(json("PATCH", { state: "REJECTED" }), ctx(id));
    expect(mocks.respondToConnection).toHaveBeenLastCalledWith({
      actor: { userId: "u1" },
      connectionId: id,
      decision: "REJECT",
    });
  });

  it.each([
    ["BLOCKED (blocking is POST /blocks)", { state: "BLOCKED" }],
    ["PENDING", { state: "PENDING" }],
    ["an empty body", {}],
  ])("refuses %s", async (_l, body) => {
    expect((await PATCH(json("PATCH", body), ctx(id))).status).toBe(400);
    expect(mocks.respondToConnection).not.toHaveBeenCalled();
  });

  it("treats a malformed id like an unknown one (404), and a foreign Origin as 403", async () => {
    expect(
      (await PATCH(json("PATCH", { state: "ACCEPTED" }), ctx("nope"))).status
    ).toBe(404);
    expect(
      (
        await PATCH(
          json("PATCH", { state: "ACCEPTED" }, "https://evil.example.test"),
          ctx(id)
        )
      ).status
    ).toBe(403);
    expect(mocks.respondToConnection).not.toHaveBeenCalled();
  });

  it("passes a use case's not-found through as 404", async () => {
    mocks.respondToConnection.mockRejectedValue(new NotFoundError());
    expect(
      (await PATCH(json("PATCH", { state: "ACCEPTED" }), ctx(id))).status
    ).toBe(404);
  });
});

describe("DELETE /api/v1/connections/:id", () => {
  it("returns 204 with no body", async () => {
    const res = await DELETE(json("DELETE", ""), ctx(id));
    expect(res.status).toBe(204);
    expect(mocks.removeConnection).toHaveBeenCalledWith({
      actor: { userId: "u1" },
      connectionId: id,
    });
  });

  it("refuses a foreign Origin and a malformed id", async () => {
    expect(
      (await DELETE(json("DELETE", "", "https://evil.example.test"), ctx(id)))
        .status
    ).toBe(403);
    expect((await DELETE(json("DELETE", ""), ctx("nope"))).status).toBe(404);
    expect(mocks.removeConnection).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/blocks", () => {
  it("blocks by member id", async () => {
    const res = await block(json("POST", { userId: other }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { id, state: "BLOCKED" } });
    expect(mocks.blockUser).toHaveBeenCalledWith({
      actor: { userId: "u1" },
      targetUserId: other,
    });
  });

  it("refuses a foreign Origin, a non-UUID and extra fields", async () => {
    expect(
      (
        await block(
          json("POST", { userId: other }, "https://evil.example.test")
        )
      ).status
    ).toBe(403);
    expect((await block(json("POST", { userId: "x" }))).status).toBe(400);
    expect(
      (await block(json("POST", { userId: other, extra: 1 }))).status
    ).toBe(400);
    expect(mocks.blockUser).not.toHaveBeenCalled();
  });
});
