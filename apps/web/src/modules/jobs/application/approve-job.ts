import { PERMISSIONS } from "@nitap/database/permissions";

import { ConflictError, NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { decideApprove, type JobStatus } from "../domain/job";
import type { Authorize } from "./authz";
import type { JobObserver, JobStore } from "./job-store";
import { refuse } from "./refusal";

/** Self-review is refused by the domain even for a job.approve holder. */
export function createApproveJob(deps: {
  store: JobStore;
  authorize: Authorize;
  observe?: JobObserver;
  now?: () => Date;
}) {
  const now = deps.now ?? (() => new Date());
  return async function approveJob(args: {
    actor: Actor | null;
    jobId: string;
  }): Promise<{ status: JobStatus }> {
    const caller = deps.authorize(args.actor, PERMISSIONS.JOB_APPROVE);

    const status = await deps.store.transaction(async (tx) => {
      const row = await tx.findById(args.jobId);
      if (!row) throw new NotFoundError();

      const decision = decideApprove(row, caller.userId, now());
      if (!decision.ok) refuse(decision);

      const updated = await tx.update(row.id, row.status, decision.patch);
      if (!updated) throw new ConflictError("INVALID_STATE_TRANSITION");

      await tx.enqueue({
        type: "job.published",
        payload: {
          v: 1,
          jobId: row.id,
          postedBy: row.postedBy,
          actorId: caller.userId,
          directPublish: false,
        },
      });
      await tx.audit({
        action: "job.approved",
        actorId: caller.userId,
        jobId: row.id,
        postedBy: row.postedBy,
      });
      return decision.patch.status;
    });
    deps.observe?.("approved", args.jobId);
    return { status };
  };
}
export type ApproveJob = ReturnType<typeof createApproveJob>;
