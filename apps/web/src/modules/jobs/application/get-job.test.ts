import { describe, expect, it } from "vitest";

import type { Permission } from "@nitap/database/permissions";

import { AuthenticationError, NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { jobRow } from "../../../../tests/support/fake-job-store";
import { createGetJob } from "./get-job";

const actor = (userId: string, grants: Permission[] = []): Actor => ({
  userId,
  accountState: "VERIFIED",
  requestId: "r",
  grants: grants.map((permission) => ({
    permission,
    scope: "GLOBAL" as const,
    expiresAt: null,
  })),
});
const authorize = (a: Actor | null) => {
  if (!a) throw new AuthenticationError();
  return a;
};
const can = (a: Actor, permission: string) =>
  a.grants.some((g) => g.permission === permission);

function build(row: ReturnType<typeof jobRow> | null) {
  return createGetJob({
    queries: { get: async () => row } as never,
    authorize,
    can,
  });
}

describe("getJob (a non-visible job is NOT_FOUND, never FORBIDDEN)", () => {
  it("a PUBLISHED job is visible to anyone with job.read", async () => {
    const getJob = build(jobRow({ status: "PUBLISHED", postedBy: "poster-1" }));
    const result = await getJob({ actor: actor("stranger-1"), jobId: "job-1" });
    expect(result.status).toBe("PUBLISHED");
  });

  it("a PENDING_REVIEW job is visible to its poster", async () => {
    const getJob = build(
      jobRow({ status: "PENDING_REVIEW", postedBy: "poster-1" })
    );
    const result = await getJob({ actor: actor("poster-1"), jobId: "job-1" });
    expect(result.status).toBe("PENDING_REVIEW");
  });

  it("a PENDING_REVIEW job is visible to a job.approve holder", async () => {
    const getJob = build(
      jobRow({ status: "PENDING_REVIEW", postedBy: "poster-1" })
    );
    const result = await getJob({
      actor: actor("mod-1", ["job.approve"]),
      jobId: "job-1",
    });
    expect(result.status).toBe("PENDING_REVIEW");
  });

  it("a PENDING_REVIEW job is NOT_FOUND to a stranger (not FORBIDDEN)", async () => {
    const getJob = build(
      jobRow({ status: "PENDING_REVIEW", postedBy: "poster-1" })
    );
    await expect(
      getJob({ actor: actor("stranger-1"), jobId: "job-1" })
    ).rejects.toThrow(NotFoundError);
  });

  it("a missing job is NOT_FOUND", async () => {
    const getJob = build(null);
    await expect(
      getJob({ actor: actor("stranger-1"), jobId: "job-1" })
    ).rejects.toThrow(NotFoundError);
  });
});
