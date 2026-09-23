import { describe, expect, it, vi } from "vitest";

import { PERMISSIONS } from "@nitap/database/permissions";
import type { Permission } from "@nitap/database/permissions";

import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
} from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import {
  createFakeJobStore,
  jobRow,
} from "../../../../tests/support/fake-job-store";
import { createApproveJob } from "./approve-job";

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
  const approveJob = createApproveJob({ store, authorize, now: () => NOW });
  return { approveJob, rows, events, audits };
}

describe("approveJob", () => {
  it("publishes a PENDING_REVIEW job and emits job.published with directPublish: false", async () => {
    const { approveJob, rows, events } = build();
    const result = await approveJob({
      actor: actor("mod-1", [PERMISSIONS.JOB_APPROVE]),
      jobId: "job-1",
    });
    expect(result.status).toBe("PUBLISHED");
    expect(rows.get("job-1")).toMatchObject({
      status: "PUBLISHED",
      reviewedBy: "mod-1",
      reviewedAt: NOW,
    });
    expect(events).toEqual([
      {
        type: "job.published",
        payload: {
          v: 1,
          jobId: "job-1",
          postedBy: "poster-1",
          actorId: "mod-1",
          directPublish: false,
        },
      },
    ]);
  });

  it("refuses the poster approving their own job, even though they hold job.approve", async () => {
    const { approveJob } = build([jobRow({ postedBy: "mod-1" })]);
    await expect(
      approveJob({
        actor: actor("mod-1", [PERMISSIONS.JOB_APPROVE]),
        jobId: "job-1",
      })
    ).rejects.toMatchObject({ code: "SELF_REVIEW_FORBIDDEN" });
  });

  it("a caller without job.approve is refused before the store is touched", async () => {
    const { approveJob, events } = build();
    await expect(
      approveJob({ actor: actor("mod-1"), jobId: "job-1" })
    ).rejects.toThrow(AuthorizationError);
    expect(events).toEqual([]);
  });

  it("approving a non-existent job is NOT_FOUND", async () => {
    const { approveJob } = build([]);
    await expect(
      approveJob({
        actor: actor("mod-1", [PERMISSIONS.JOB_APPROVE]),
        jobId: "job-1",
      })
    ).rejects.toThrow(NotFoundError);
  });

  it("calls observe with 'approved'", async () => {
    const observe = vi.fn();
    const { store } = createFakeJobStore([jobRow({ postedBy: "poster-1" })]);
    const approveJob = createApproveJob({
      store,
      authorize,
      now: () => NOW,
      observe,
    });
    await approveJob({
      actor: actor("mod-1", [PERMISSIONS.JOB_APPROVE]),
      jobId: "job-1",
    });
    expect(observe).toHaveBeenCalledWith("approved", "job-1");
  });

  it("audits job.approved in the same transaction", async () => {
    const { approveJob, audits } = build();
    await approveJob({
      actor: actor("mod-1", [PERMISSIONS.JOB_APPROVE]),
      jobId: "job-1",
    });
    expect(audits).toEqual([
      {
        action: "job.approved",
        actorId: "mod-1",
        jobId: "job-1",
        postedBy: "poster-1",
      },
    ]);
  });

  it("writes no audit when the approval is refused", async () => {
    const { approveJob, audits } = build();
    await expect(
      approveJob({
        actor: actor("poster-1", [PERMISSIONS.JOB_APPROVE]),
        jobId: "job-1",
      })
    ).rejects.toThrow();
    expect(audits).toEqual([]);
  });
});
