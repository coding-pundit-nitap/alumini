import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActor: vi.fn(),
  requestMentorship: vi.fn(),
  listMentorships: vi.fn(),
  transitionMentorship: vi.fn(),
}));
vi.mock("@/config/env", () => ({
  env: { BETTER_AUTH_URL: "https://alumni.example.test" },
}));
vi.mock("@/modules/auth", () => ({ getActor: mocks.getActor }));
vi.mock("@/composition/mentorship", () => mocks);
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

import { PATCH } from "./[id]/route";
import { GET, POST } from "./route";

const id = "11111111-1111-4111-8111-111111111111";
const mentor = "22222222-2222-4222-8222-222222222222";
const ORIGIN = "https://alumni.example.test";

const json = (method: string, body: unknown, origin: string | null = ORIGIN) =>
  new Request("https://alumni.example.test/api/v1/mentorships", {
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
  mocks.requestMentorship.mockResolvedValue({ mentorshipId: id });
  mocks.transitionMentorship.mockResolvedValue({ state: "ACCEPTED" });
  mocks.listMentorships.mockResolvedValue({ data: [], page: {} });
});

describe("POST /api/v1/mentorships", () => {
  it("creates: 201 with a Location header; message and topic go to the use case unparsed", async () => {
    const res = await POST(
      json("POST", { mentorId: mentor, message: "hi", topic: "sql" })
    );
    expect(res.status).toBe(201);
    expect(res.headers.get("location")).toBe(`/api/v1/mentorships/${id}`);
    expect(await res.json()).toEqual({ data: { id, state: "REQUESTED" } });
    expect(mocks.requestMentorship).toHaveBeenCalledWith({
      actor: { userId: "u1" },
      mentorId: mentor,
      input: { message: "hi", topic: "sql" },
    });
  });

  it.each([
    [
      "a foreign Origin (CSRF)",
      () => json("POST", { mentorId: mentor }, "https://evil.example.test"),
      403,
      "ORIGIN_NOT_ALLOWED",
    ],
    [
      "a body that is not JSON",
      () => json("POST", "{oops"),
      400,
      "MALFORMED_REQUEST",
    ],
    ["a missing mentorId", () => json("POST", {}), 400, "VALIDATION_FAILED"],
    [
      "a mentorId that is not a UUID",
      () => json("POST", { mentorId: "x" }),
      400,
      "VALIDATION_FAILED",
    ],
  ])(
    "refuses %s before touching the use case",
    async (_l, request, status, code) => {
      const res = await POST(request());
      expect(res.status).toBe(status);
      expect((await res.json()).error.code).toBe(code);
      expect(mocks.requestMentorship).not.toHaveBeenCalled();
    }
  );

  it("maps a signed-out caller to 401", async () => {
    mocks.requestMentorship.mockRejectedValue(new AuthenticationError());
    expect(
      (await POST(json("POST", { mentorId: mentor, message: "hi" }))).status
    ).toBe(401);
  });
});

describe("PATCH /api/v1/mentorships/:id", () => {
  it.each(["accept", "decline", "cancel"])(
    "passes %s to the use case",
    async (action) => {
      const res = await PATCH(json("PATCH", { action }), ctx(id));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ data: { id, state: "ACCEPTED" } });
      expect(mocks.transitionMentorship).toHaveBeenLastCalledWith({
        actor: { userId: "u1" },
        mentorshipId: id,
        action,
        note: undefined,
      });
    }
  );

  it("forwards a decline note", async () => {
    await PATCH(json("PATCH", { action: "decline", note: "busy" }), ctx(id));
    expect(mocks.transitionMentorship).toHaveBeenCalledWith(
      expect.objectContaining({ action: "decline", note: "busy" })
    );
  });

  it.each([
    ["an unknown action", { action: "start" }],
    ["an empty body", {}],
    ["an extra field", { action: "accept", state: "ACTIVE" }],
  ])("refuses %s", async (_l, body) => {
    expect((await PATCH(json("PATCH", body), ctx(id))).status).toBe(400);
    expect(mocks.transitionMentorship).not.toHaveBeenCalled();
  });

  it("refuses malformed JSON, a foreign Origin, and treats a bad id as 404", async () => {
    expect((await PATCH(json("PATCH", "{oops"), ctx(id))).status).toBe(400);
    expect(
      (
        await PATCH(
          json("PATCH", { action: "accept" }, "https://evil.example.test"),
          ctx(id)
        )
      ).status
    ).toBe(403);
    expect(
      (await PATCH(json("PATCH", { action: "accept" }), ctx("nope"))).status
    ).toBe(404);
    expect(mocks.transitionMentorship).not.toHaveBeenCalled();
  });

  it("passes a use case's not-found through as 404", async () => {
    mocks.transitionMentorship.mockRejectedValue(new NotFoundError());
    expect(
      (await PATCH(json("PATCH", { action: "accept" }), ctx(id))).status
    ).toBe(404);
  });
});

describe("GET /api/v1/mentorships", () => {
  const get = (query: string) =>
    GET(new Request(`https://alumni.example.test/api/v1/mentorships?${query}`));

  it("passes role, repeated states, limit and cursor; the response is no-store", async () => {
    const res = await get(
      "role=mentor&state=ACCEPTED&state=ACTIVE&limit=5&cursor=abc"
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.listMentorships).toHaveBeenCalledWith({
      actor: { userId: "u1" },
      role: "mentor",
      states: ["ACCEPTED", "ACTIVE"],
      limit: 5,
      cursor: "abc",
    });
  });

  it.each(["", "role=admin", "role=mentor&state=NOPE", "role=mentee&limit=0"])(
    "refuses the query %j with 400",
    async (query) => {
      expect((await get(query)).status).toBe(400);
      expect(mocks.listMentorships).not.toHaveBeenCalled();
    }
  );

  it("maps a signed-out caller to 401", async () => {
    mocks.listMentorships.mockRejectedValue(new AuthenticationError());
    expect((await get("role=mentee")).status).toBe(401);
  });
});
