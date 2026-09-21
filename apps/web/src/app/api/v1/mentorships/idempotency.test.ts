import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActor: vi.fn(),
  requestMentorship: vi.fn(),
  rows: new Map<string, Record<string, unknown>>(),
}));
vi.mock("@/config/env", () => ({
  env: { BETTER_AUTH_URL: "https://alumni.example.test" },
}));
vi.mock("@/modules/auth", () => ({ getActor: mocks.getActor }));
vi.mock("@/composition/mentorship", () => ({
  requestMentorship: mocks.requestMentorship,
}));
vi.mock("@/infrastructure/database/client", () => ({ prisma: {} }));
// The REAL respondIdempotently runs; only its database store is replaced by an in-memory one.
vi.mock("@nitap/database/idempotency", () => ({
  createIdempotencyStore: () => {
    const id = (u: string, k: string) => `${u}|${k}`;
    return {
      claim: async (
        _db: unknown,
        i: { userId: string; key: string; requestHash: string }
      ) => {
        if (mocks.rows.has(id(i.userId, i.key))) return false;
        mocks.rows.set(id(i.userId, i.key), {
          requestHash: i.requestHash,
          state: "IN_PROGRESS",
          response: null,
          createdAt: new Date(),
        });
        return true;
      },
      find: async (_db: unknown, u: string, k: string) =>
        mocks.rows.get(id(u, k)) ?? null,
      complete: async (
        _db: unknown,
        u: string,
        k: string,
        response: unknown
      ) => {
        Object.assign(mocks.rows.get(id(u, k)) ?? {}, {
          state: "DONE",
          response,
        });
      },
      release: async (_db: unknown, u: string, k: string) => {
        mocks.rows.delete(id(u, k));
      },
      reclaim: async () => false,
    };
  },
}));

import { POST } from "./route";

const mentor = "22222222-2222-4222-8222-222222222222";
const KEY = "33333333-3333-4333-8333-333333333333";

const post = (body: unknown) =>
  new Request("https://alumni.example.test/api/v1/mentorships", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://alumni.example.test",
      "idempotency-key": KEY,
    },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  mocks.rows.clear();
  mocks.getActor.mockReset().mockResolvedValue({ userId: "u1" });
  mocks.requestMentorship
    .mockReset()
    .mockResolvedValue({ mentorshipId: "ms-1" });
});

describe("POST /api/v1/mentorships under Idempotency-Key", () => {
  it("replays the first response for an identical retry, running the use case once", async () => {
    const body = { mentorId: mentor, message: "hi" };
    const first = await POST(post(body));
    const second = await POST(post(body));
    expect(second.status).toBe(first.status);
    expect(await second.json()).toEqual(await first.json());
    expect(second.headers.get("idempotent-replay")).toBe("true");
    expect(mocks.requestMentorship).toHaveBeenCalledTimes(1);
  });

  it("refuses the same key with a different body as IDEMPOTENCY_KEY_REUSED", async () => {
    await POST(post({ mentorId: mentor, message: "hi" }));
    const res = await POST(post({ mentorId: mentor, message: "different" }));
    expect((await res.json()).error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(mocks.requestMentorship).toHaveBeenCalledTimes(1);
  });
});
