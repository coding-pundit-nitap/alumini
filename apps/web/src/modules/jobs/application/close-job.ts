import { PERMISSIONS } from "@nitap/database/permissions";
import type { Permission } from "@nitap/database/permissions";

import { ConflictError, NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { decideClose, type JobStatus } from "../domain/job";
import type { Authorize } from "./authz";
import type { JobObserver, JobStore } from "./job-store";
import { refuse } from "./refusal";

/** (withdrawal). Poster or job.manage only; never sets EXPIRED (worker-only). */
export function createCloseJob(deps: {
  store: JobStore;
  authorize: Authorize;
  can: (actor: Actor, permission: Permission) => boolean;
  observe?: JobObserver;
}) {
  return async function closeJob(args: {
    actor: Actor | null;
    jobId: string;
  }): Promise<{ status: JobStatus }> {
    const caller = deps.authorize(args.actor, PERMISSIONS.JOB_READ);

    const status = await deps.store.transaction(async (tx) => {
      const row = await tx.findById(args.jobId);
      if (!row) throw new NotFoundError();

      const isOwnerOrManager =
        caller.userId === row.postedBy ||
        deps.can(caller, PERMISSIONS.JOB_MANAGE);
      const decision = decideClose(row, isOwnerOrManager);
      if (!decision.ok) refuse(decision);

      const updated = await tx.update(row.id, row.status, decision.patch);
      if (!updated) throw new ConflictError("INVALID_STATE_TRANSITION");

      await tx.enqueue({
        type: "job.closed",
        payload: {
          v: 1,
          jobId: row.id,
          postedBy: row.postedBy,
          actorId: caller.userId,
        },
      });
      // Closing your own job is not an admin action; closing someone else's (job.manage) is.
      if (caller.userId !== row.postedBy) {
        await tx.audit({
          action: "job.closed",
          actorId: caller.userId,
          jobId: row.id,
          postedBy: row.postedBy,
        });
      }
      return decision.patch.status;
    });
    deps.observe?.("closed", args.jobId);
    return { status };
  };
}
export type CloseJob = ReturnType<typeof createCloseJob>;
