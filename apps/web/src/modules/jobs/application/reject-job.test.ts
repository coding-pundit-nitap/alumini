import { describe, expect, it } from "vitest";

import { PERMISSIONS } from "@nitap/database/permissions";
import type { Permission } from "@nitap/database/permissions";

import { AuthenticationError, AuthorizationError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import {
  createFakeJobStore,
  jobRow,
} from "../../../../tests/support/fake-job-store";
import { createRejectJob } from "./reject-job";

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
const authorize = (a: Actor | null, permission: string) => {
  if (!a) throw new AuthenticationError();
  if (!a.grants.some((g) => g.permission === permission)) {
    throw new AuthorizationError({ code: "PERMISSION_DENIED" });
  }
  return a;
};
const NOW = new Date("2026-09-23T10:00:00Z");

function build(seed = [jobRow({ postedBy: "poster-1" })]) {
  const { store, rows, events, audits } = createFakeJobStore(seed);
  const rejectJob = createRejectJob({ store, authorize, now: () => NOW });
  return { rejectJob, rows, events, audits };
}

describe("rejectJob", () => {
  it("rejects a PENDING_REVIEW job with a note and emits job.rejected", async () => {
    const { rejectJob, rows, events } = build();
    const result = await rejectJob({
      actor: actor("mod-1", [PERMISSIONS.JOB_APPROVE]),
      jobId: "job-1",
      input: { reviewNote: "Add a salary range" },
    });
    expect(result.status).toBe("REJECTED");
    expect(rows.get("job-1")).toMatchObject({
      status: "REJECTED",
      reviewedBy: "mod-1",
      reviewedAt: NOW,
      reviewNote: "Add a salary range",
    });
    expect(events).toEqual([
      {
        type: "job.rejected",
        payload: {
          v: 1,
          jobId: "job-1",
          postedBy: "poster-1",
          actorId: "mod-1",
        },
      },
    ]);
  });

  it("requires a non-empty reviewNote (rejected at the Zod boundary before decideReject runs)", async () => {
    const { rejectJob } = build();
    await expect(
      rejectJob({
        actor: actor("mod-1", [PERMISSIONS.JOB_APPROVE]),
        jobId: "job-1",
        input: { reviewNote: "" },
      })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("refuses the poster rejecting their own job", async () => {
    const { rejectJob } = build([jobRow({ postedBy: "mod-1" })]);
    await expect(
      rejectJob({
        actor: actor("mod-1", [PERMISSIONS.JOB_APPROVE]),
        jobId: "job-1",
        input: { reviewNote: "note" },
      })
    ).rejects.toMatchObject({ code: "SELF_REVIEW_FORBIDDEN" });
  });

  it("audits job.rejected, and nothing when refused", async () => {
    const { rejectJob, audits } = build();
    await expect(
      rejectJob({
        actor: actor("poster-1", [PERMISSIONS.JOB_APPROVE]),
        jobId: "job-1",
        input: { reviewNote: "no" },
      })
    ).rejects.toThrow();
    expect(audits).toEqual([]);
    await rejectJob({
      actor: actor("mod-1", [PERMISSIONS.JOB_APPROVE]),
      jobId: "job-1",
      input: { reviewNote: "Add a salary range" },
    });
    expect(audits).toEqual([
      {
        action: "job.rejected",
        actorId: "mod-1",
        jobId: "job-1",
        postedBy: "poster-1",
      },
    ]);
  });
});
