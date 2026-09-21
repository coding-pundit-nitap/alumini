import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActor: vi.fn(),
  getMentorProfile: vi.fn(),
  saveMentorProfile: vi.fn(),
  listMentors: vi.fn(),
}));
vi.mock("@/config/env", () => ({
  env: { BETTER_AUTH_URL: "https://alumni.example.test" },
}));
vi.mock("@/modules/auth", () => ({ getActor: mocks.getActor }));
vi.mock("@/composition/mentorship", () => mocks);

import { AuthenticationError } from "@/lib/errors";

import { GET as getMe, PUT } from "./me/route";
import { GET } from "./route";

const ORIGIN = "https://alumni.example.test";

const jsonRequest = (
  url: string,
  method: string,
  body: unknown,
  origin: string | null = ORIGIN
) =>
  new Request(url, {
    method,
    headers: {
      "content-type": "application/json",
      ...(origin ? { origin } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.getActor.mockResolvedValue({ userId: "u1" });
  mocks.listMentors.mockResolvedValue({
    data: [],
    page: { limit: 20, nextCursor: null, hasMore: false },
  });
  mocks.getMentorProfile.mockResolvedValue(null);
  mocks.saveMentorProfile.mockResolvedValue({ userId: "u1", expertise: "DB" });
});

describe("GET /api/v1/mentors", () => {
  it("returns the page and never caches", async () => {
    const res = await GET(
      new Request("https://alumni.example.test/api/v1/mentors")
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.listMentors).toHaveBeenCalledWith({ actor: { userId: "u1" } });
  });

  it("rejects an out-of-range limit before calling the use case", async () => {
    const res = await GET(
      new Request("https://alumni.example.test/api/v1/mentors?limit=500")
    );
    expect(res.status).toBe(400);
    expect(mocks.listMentors).not.toHaveBeenCalled();
  });

  it("maps a signed-out caller to 401", async () => {
    mocks.listMentors.mockRejectedValue(new AuthenticationError());
    const res = await GET(
      new Request("https://alumni.example.test/api/v1/mentors")
    );
    expect(res.status).toBe(401);
  });
});

describe("GET /api/v1/mentors/me", () => {
  it("returns the caller's own offer", async () => {
    const res = await getMe(
      new Request("https://alumni.example.test/api/v1/mentors/me")
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({ data: null });
    expect(mocks.getMentorProfile).toHaveBeenCalledWith({
      actor: { userId: "u1" },
    });
  });
});

describe("PUT /api/v1/mentors/me", () => {
  it("passes the parsed body to the use case and returns { data }", async () => {
    const body = { expertise: "DB", topics: ["sql"] };
    const res = await PUT(
      jsonRequest("https://alumni.example.test/api/v1/mentors/me", "PUT", body)
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: { userId: "u1", expertise: "DB" },
    });
    expect(mocks.saveMentorProfile).toHaveBeenCalledWith({
      actor: { userId: "u1" },
      input: body,
    });
  });

  it("rejects a foreign Origin with 403 ORIGIN_NOT_ALLOWED", async () => {
    const res = await PUT(
      jsonRequest(
        "https://alumni.example.test/api/v1/mentors/me",
        "PUT",
        { expertise: "DB" },
        "https://evil.example.test"
      )
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("ORIGIN_NOT_ALLOWED");
    expect(mocks.saveMentorProfile).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with 400 MALFORMED_REQUEST", async () => {
    const res = await PUT(
      jsonRequest(
        "https://alumni.example.test/api/v1/mentors/me",
        "PUT",
        "{oops"
      )
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("MALFORMED_REQUEST");
    expect(mocks.saveMentorProfile).not.toHaveBeenCalled();
  });
});
