import { describe, expect, it } from "vitest";

import { PERMISSIONS } from "@nitap/database/permissions";
import type { Permission } from "@nitap/database/permissions";

import { AuthenticationError, AuthorizationError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { jobRow } from "../../../../tests/support/fake-job-store";
import { createListPendingJobs } from "./list-pending-jobs";

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

describe("listPendingJobs", () => {
  it("requires job.approve", async () => {
    const listPendingJobs = createListPendingJobs({
      queries: { listPending: async () => [] } as never,
      authorize,
    });
    await expect(listPendingJobs({ actor: actor("mod-1") })).rejects.toThrow(
      AuthorizationError
    );
  });

  it("returns the queue page, capped and cursored the same way as listMyJobs", async () => {
    const rows = [jobRow({ id: "a" }), jobRow({ id: "b" })];
    const listPendingJobs = createListPendingJobs({
      queries: { listPending: async () => rows } as never,
      authorize,
    });
    const page = await listPendingJobs({
      actor: actor("mod-1", [PERMISSIONS.JOB_APPROVE]),
      limit: 1,
    });
    expect(page.data).toHaveLength(1);
    expect(page.page.hasMore).toBe(true);
  });
});
