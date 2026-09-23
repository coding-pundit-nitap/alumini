import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: new Headers({ "x-request-id": "req-1" }),
  getActor: vi.fn(),
  createJob: vi.fn(),
  editJob: vi.fn(),
  approveJob: vi.fn(),
  rejectJob: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => mocks.headers }));
vi.mock("@/modules/auth", () => ({ getActor: mocks.getActor }));
vi.mock("@/composition/jobs", () => mocks);
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

import { ValidationError } from "@/lib/errors";

import {
  approveJobAction,
  createJobAction,
  editJobAction,
  rejectJobAction,
} from "./actions";

beforeEach(() => {
  mocks.getActor.mockReset().mockResolvedValue({ userId: "u1" });
  mocks.createJob.mockReset();
  mocks.editJob.mockReset();
  mocks.approveJob.mockReset();
  mocks.rejectJob.mockReset();
});

describe("createJobAction", () => {
  it("returns ok:true with the created job's id and status", async () => {
    mocks.createJob.mockResolvedValue({
      jobId: "job-1",
      status: "PENDING_REVIEW",
    });
    const result = await createJobAction({ title: "Backend Engineer" });
    expect(result).toEqual({
      ok: true,
      data: { jobId: "job-1", status: "PENDING_REVIEW" },
    });
  });

  it("returns ok:false on a thrown AppError", async () => {
    mocks.createJob.mockRejectedValue(new ValidationError());
    const result = await createJobAction({});
    expect(result.ok).toBe(false);
  });
});

describe("editJobAction", () => {
  it("rejects a non-uuid jobId before calling the use case", async () => {
    const result = await editJobAction("not-a-uuid", {});
    expect(result.ok).toBe(false);
    expect(mocks.editJob).not.toHaveBeenCalled();
  });

  it("passes a valid uuid through to editJob", async () => {
    mocks.editJob.mockResolvedValue({ status: "PUBLISHED" });
    const id = "11111111-1111-4111-8111-111111111111";
    const result = await editJobAction(id, { title: "New title" });
    expect(result).toEqual({ ok: true, data: { status: "PUBLISHED" } });
    expect(mocks.editJob).toHaveBeenCalledWith({
      actor: { userId: "u1" },
      jobId: id,
      input: { title: "New title" },
    });
  });
});

describe("approveJobAction / rejectJobAction", () => {
  it("rejects a non-uuid jobId before calling the use case", async () => {
    const result = await approveJobAction("not-a-uuid");
    expect(result.ok).toBe(false);
    expect(mocks.approveJob).not.toHaveBeenCalled();
  });

  it("approves a valid job id", async () => {
    mocks.approveJob.mockResolvedValue({ status: "PUBLISHED" });
    const id = "11111111-1111-4111-8111-111111111111";
    const result = await approveJobAction(id);
    expect(result).toEqual({ ok: true, data: { status: "PUBLISHED" } });
  });

  it("rejects with a note", async () => {
    mocks.rejectJob.mockResolvedValue({ status: "REJECTED" });
    const id = "11111111-1111-4111-8111-111111111111";
    const result = await rejectJobAction(id, "Add a salary range");
    expect(result).toEqual({ ok: true, data: { status: "REJECTED" } });
    expect(mocks.rejectJob).toHaveBeenCalledWith({
      actor: { userId: "u1" },
      jobId: id,
      input: { reviewNote: "Add a salary range" },
    });
  });
});
