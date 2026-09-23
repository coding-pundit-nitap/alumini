import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActor: vi.fn(),
  createEvent: vi.fn(),
  getEvent: vi.fn(),
  listEvents: vi.fn(),
}));
vi.mock("@/config/env", () => ({
  env: { BETTER_AUTH_URL: "https://alumni.example.test" },
}));
vi.mock("@/modules/auth", () => ({ getActor: mocks.getActor }));
vi.mock("@/composition/events", () => mocks);
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

import {
  AuthenticationError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";

import { GET as GET_ONE } from "./[id]/route";
import { GET, POST } from "./route";

const id = "11111111-1111-4111-8111-111111111111";
const ORIGIN = "https://alumni.example.test";
const actor = { userId: "u1" };
const detail = {
  id,
  title: "Reunion",
  startsAt: new Date("2026-10-01T12:30:00Z"),
};
const body = {
  title: "Reunion",
  description: "The annual alumni reunion.",
  startsAt: "2026-10-01T12:30:00Z",
  registrationDeadline: "2026-09-30T12:30:00Z",
  timezone: "Asia/Kolkata",
  isOnline: false,
  location: "Main hall",
  capacity: 100,
};

const post = (payload: unknown, origin: string | null = ORIGIN) =>
  new Request("https://alumni.example.test/api/v1/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(origin ? { origin } : {}),
    },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
const ctx = (value: string) => ({ params: Promise.resolve({ id: value }) });

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.getActor.mockResolvedValue(actor);
  mocks.createEvent.mockResolvedValue({ eventId: id });
  mocks.getEvent.mockResolvedValue(detail);
  mocks.listEvents.mockResolvedValue({ data: [], page: { nextCursor: null } });
});

describe("POST /api/v1/events", () => {
  it("creates: 201 with the detail and a Location header; the body goes to the use case as input", async () => {
    const res = await POST(post(body));
    expect(res.status).toBe(201);
    expect(res.headers.get("location")).toBe(`/api/v1/events/${id}`);
    expect(await res.json()).toEqual({
      data: { ...detail, startsAt: "2026-10-01T12:30:00.000Z" },
    });
    expect(mocks.createEvent).toHaveBeenCalledWith({ actor, input: body });
    expect(mocks.getEvent).toHaveBeenCalledWith({ actor, eventId: id });
  });

  it("refuses a foreign Origin (CSRF) and a non-JSON body before the use case", async () => {
    const foreign = await POST(post(body, "https://evil.example.test"));
    expect(foreign.status).toBe(403);
    expect((await foreign.json()).error.code).toBe("ORIGIN_NOT_ALLOWED");
    const malformed = await POST(post("{oops"));
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).error.code).toBe("MALFORMED_REQUEST");
    expect(mocks.createEvent).not.toHaveBeenCalled();
  });

  it("passes the use case's validation details through as 400", async () => {
    mocks.createEvent.mockRejectedValue(
      new ValidationError({
        details: [{ field: "startsAt", code: "INVALID", message: "past" }],
      })
    );
    const res = await POST(post(body));
    expect(res.status).toBe(400);
    expect((await res.json()).error.details).toEqual([
      { field: "startsAt", code: "INVALID", message: "past" },
    ]);
  });

  it("maps a signed-out caller to 401", async () => {
    mocks.createEvent.mockRejectedValue(new AuthenticationError());
    expect((await POST(post(body))).status).toBe(401);
  });
});

describe("GET /api/v1/events", () => {
  const get = (query: string) =>
    GET(new Request(`https://alumni.example.test/api/v1/events?${query}`));

  it("passes scope, includeCancelled, limit and cursor; the response is no-store", async () => {
    const res = await get(
      "scope=past&includeCancelled=true&limit=5&cursor=abc"
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({ data: [], page: { nextCursor: null } });
    expect(mocks.listEvents).toHaveBeenCalledWith({
      actor,
      scope: "past",
      includeCancelled: true,
      limit: 5,
      cursor: "abc",
    });
  });

  it("defaults to upcoming, scheduled only", async () => {
    await get("");
    expect(mocks.listEvents).toHaveBeenCalledWith({
      actor,
      scope: "upcoming",
      includeCancelled: false,
      limit: undefined,
      cursor: undefined,
    });
  });

  it.each([
    "scope=all",
    "includeCancelled=yes",
    "limit=0",
    "limit=51",
    "limit=x",
  ])("refuses the query %j with 400", async (query) => {
    expect((await get(query)).status).toBe(400);
    expect(mocks.listEvents).not.toHaveBeenCalled();
  });

  it("maps a signed-out caller to 401", async () => {
    mocks.listEvents.mockRejectedValue(new AuthenticationError());
    expect((await get("")).status).toBe(401);
  });
});

describe("GET /api/v1/events/:id", () => {
  const req = () => new Request(`https://alumni.example.test/api/v1/events/x`);

  it("returns the detail, no-store", async () => {
    const res = await GET_ONE(req(), ctx(id));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect((await res.json()).data.id).toBe(id);
    expect(mocks.getEvent).toHaveBeenCalledWith({ actor, eventId: id });
  });

  it("treats a malformed id as 404 without touching the use case", async () => {
    const res = await GET_ONE(req(), ctx("nope"));
    expect(res.status).toBe(404);
    expect(mocks.getEvent).not.toHaveBeenCalled();
  });

  it("passes the use case's not-found through as 404", async () => {
    mocks.getEvent.mockRejectedValue(new NotFoundError());
    expect((await GET_ONE(req(), ctx(id))).status).toBe(404);
  });
});
