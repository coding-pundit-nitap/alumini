import { describe, expect, it } from "vitest";

import { PERMISSIONS } from "@nitap/database/permissions";
import type { Permission } from "@nitap/database/permissions";

import { AuthenticationError, NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import {
  createFakeJobStore,
  jobRow,
} from "../../../../tests/support/fake-job-store";
import { createCloseJob } from "./close-job";

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

function build(seed = [jobRow({ postedBy: "poster-1", status: "PUBLISHED" })]) {
  const { store, rows, events, audits } = createFakeJobStore(seed);
  const closeJob = createCloseJob({ store, authorize, can });
  return { closeJob, rows, events, audits };
}

describe("closeJob", () => {
  it("the poster can withdraw their own PUBLISHED job", async () => {
    const { closeJob, rows, events } = build();
    const result = await closeJob({ actor: actor("poster-1"), jobId: "job-1" });
    expect(result.status).toBe("CLOSED");
    expect(rows.get("job-1")?.status).toBe("CLOSED");
    expect(events).toEqual([
      {
        type: "job.closed",
        payload: {
          v: 1,
          jobId: "job-1",
          postedBy: "poster-1",
          actorId: "poster-1",
        },
      },
    ]);
  });

  it("a job.manage holder can withdraw someone else's job", async () => {
    const { closeJob } = build();
    const result = await closeJob({
      actor: actor("admin-1", [PERMISSIONS.JOB_MANAGE]),
      jobId: "job-1",
    });
    expect(result.status).toBe("CLOSED");
  });

  it("a stranger without job.manage is refused NOT_OWNER", async () => {
    const { closeJob } = build();
    await expect(
      closeJob({ actor: actor("stranger-1"), jobId: "job-1" })
    ).rejects.toMatchObject({
      code: "NOT_OWNER",
    });
  });

  it("closing a non-existent job is NOT_FOUND", async () => {
    const { closeJob } = build([]);
    await expect(
      closeJob({ actor: actor("poster-1"), jobId: "job-1" })
    ).rejects.toThrow(NotFoundError);
  });

  it.each(["REJECTED", "EXPIRED", "CLOSED"] as const)(
    "refuses closing from %s",
    async (status) => {
      const { closeJob } = build([jobRow({ postedBy: "poster-1", status })]);
      await expect(
        closeJob({ actor: actor("poster-1"), jobId: "job-1" })
      ).rejects.toMatchObject({
        code: "INVALID_STATE_TRANSITION",
      });
    }
  );

  it("audits a job.manage holder closing someone else's job, not the poster closing their own", async () => {
    const own = build();
    await own.closeJob({
      actor: actor("poster-1", [PERMISSIONS.JOB_READ]),
      jobId: "job-1",
    });
    expect(own.audits).toEqual([]);

    const managed = build();
    await managed.closeJob({
      actor: actor("tp-1", [PERMISSIONS.JOB_READ, PERMISSIONS.JOB_MANAGE]),
      jobId: "job-1",
    });
    expect(managed.audits).toEqual([
      {
        action: "job.closed",
        actorId: "tp-1",
        jobId: "job-1",
        postedBy: "poster-1",
      },
    ]);
  });
});
