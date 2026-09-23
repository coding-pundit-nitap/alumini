import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActor: vi.fn(),
  createJob: vi.fn(),
  editJob: vi.fn(),
  getJob: vi.fn(),
  approveJob: vi.fn(),
  rejectJob: vi.fn(),
}));
vi.mock("@/config/env", () => ({
  env: { BETTER_AUTH_URL: "https://alumni.example.test" },
}));
vi.mock("@/modules/auth", () => ({ getActor: mocks.getActor }));
vi.mock("@/composition/jobs", () => mocks);
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

import { AuthorizationError } from "@/lib/errors";

import { POST as approve } from "./[id]/approve/route";
import { POST as reject } from "./[id]/reject/route";
import { GET, PATCH } from "./[id]/route";
import { POST } from "./route";

const ORIGIN = "https://alumni.example.test";
const ID = "11111111-1111-4111-8111-111111111111";

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
    body: JSON.stringify(body),
  });

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.getActor.mockResolvedValue({ userId: "u1" });
});

describe("POST /api/v1/jobs", () => {
  it("rejects a cross-origin request (CSRF)", async () => {
    const res = await POST(
      jsonRequest(
        "https://alumni.example.test/api/v1/jobs",
        "POST",
        { title: "x" },
        "https://evil.example"
      )
    );
    expect(res.status).toBe(403);
    expect(mocks.createJob).not.toHaveBeenCalled();
  });

  it("creates and returns 201 with a Location header", async () => {
    mocks.createJob.mockResolvedValue({ jobId: ID, status: "PENDING_REVIEW" });
    const res = await POST(
      jsonRequest("https://alumni.example.test/api/v1/jobs", "POST", {
        title: "x",
      })
    );
    expect(res.status).toBe(201);
    expect(res.headers.get("Location")).toBe(`/api/v1/jobs/${ID}`);
  });
});

describe("GET /api/v1/jobs/:id", () => {
  it("returns the job (IDOR guarded by getJob's own visibility check, not the route)", async () => {
    mocks.getJob.mockResolvedValue({ id: ID, status: "PUBLISHED" });
    const res = await GET(
      new Request(`https://alumni.example.test/api/v1/jobs/${ID}`),
      {
        params: Promise.resolve({ id: ID }),
      }
    );
    expect(res.status).toBe(200);
  });

  it("a malformed id is NOT_FOUND, not a 500", async () => {
    const res = await GET(
      new Request("https://alumni.example.test/api/v1/jobs/not-a-uuid"),
      {
        params: Promise.resolve({ id: "not-a-uuid" }),
      }
    );
    expect(res.status).toBe(404);
    expect(mocks.getJob).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/v1/jobs/:id", () => {
  it("rejects a cross-origin request (CSRF)", async () => {
    const res = await PATCH(
      jsonRequest(
        `https://alumni.example.test/api/v1/jobs/${ID}`,
        "PATCH",
        { title: "x" },
        "https://evil.example"
      ),
      { params: Promise.resolve({ id: ID }) }
    );
    expect(res.status).toBe(403);
    expect(mocks.editJob).not.toHaveBeenCalled();
  });

  it("edits and returns the new status", async () => {
    mocks.editJob.mockResolvedValue({ status: "PENDING_REVIEW" });
    const res = await PATCH(
      jsonRequest(`https://alumni.example.test/api/v1/jobs/${ID}`, "PATCH", {
        title: "x",
      }),
      { params: Promise.resolve({ id: ID }) }
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data.status).toBe("PENDING_REVIEW");
  });
});

describe("POST /api/v1/jobs/:id/approve", () => {
  it("rejects a cross-origin request (CSRF)", async () => {
    const res = await approve(
      jsonRequest(
        `https://alumni.example.test/api/v1/jobs/${ID}/approve`,
        "POST",
        {},
        "https://evil.example"
      ),
      { params: Promise.resolve({ id: ID }) }
    );
    expect(res.status).toBe(403);
    expect(mocks.approveJob).not.toHaveBeenCalled();
  });

  it("a stranger with no permission gets PERMISSION_DENIED, not a leak of the job's existence (IDOR)", async () => {
    mocks.approveJob.mockRejectedValue(
      new AuthorizationError({ code: "PERMISSION_DENIED" })
    );
    const res = await approve(
      jsonRequest(
        `https://alumni.example.test/api/v1/jobs/${ID}/approve`,
        "POST",
        {}
      ),
      { params: Promise.resolve({ id: ID }) }
    );
    expect(res.status).toBe(403);
  });

  it("approves and returns the new status", async () => {
    mocks.approveJob.mockResolvedValue({ status: "PUBLISHED" });
    const res = await approve(
      jsonRequest(
        `https://alumni.example.test/api/v1/jobs/${ID}/approve`,
        "POST",
        {}
      ),
      { params: Promise.resolve({ id: ID }) }
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data.status).toBe("PUBLISHED");
  });
});

describe("POST /api/v1/jobs/:id/reject", () => {
  it("rejects a cross-origin request (CSRF)", async () => {
    const res = await reject(
      jsonRequest(
        `https://alumni.example.test/api/v1/jobs/${ID}/reject`,
        "POST",
        { reviewNote: "x" },
        "https://evil.example"
      ),
      { params: Promise.resolve({ id: ID }) }
    );
    expect(res.status).toBe(403);
    expect(mocks.rejectJob).not.toHaveBeenCalled();
  });

  it("rejects with a note and returns the new status", async () => {
    mocks.rejectJob.mockResolvedValue({ status: "REJECTED" });
    const res = await reject(
      jsonRequest(
        `https://alumni.example.test/api/v1/jobs/${ID}/reject`,
        "POST",
        {
          reviewNote: "Add detail",
        }
      ),
      { params: Promise.resolve({ id: ID }) }
    );
    expect(res.status).toBe(200);
    expect(mocks.rejectJob).toHaveBeenCalledWith({
      actor: { userId: "u1" },
      jobId: ID,
      input: { reviewNote: "Add detail" },
    });
  });
});
