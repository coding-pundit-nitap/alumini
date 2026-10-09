import { PERMISSIONS } from "@nitap/database/permissions";

import { ConflictError, NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { decideReject, type JobStatus } from "../domain/job";
import { rejectJobInput } from "../domain/validation";
import type { Authorize } from "./authz";
import type { JobObserver, JobStore } from "./job-store";
import { refuse } from "./refusal";
import { parse } from "./validation-parse";

/** A rejection note is required (REVIEW_NOTE_REQUIRED), belt-and-braces with ck_job_reject_note. */
export function createRejectJob(deps: {
  store: JobStore;
  authorize: Authorize;
  observe?: JobObserver;
  now?: () => Date;
}) {
  const now = deps.now ?? (() => new Date());
  return async function rejectJob(args: {
    actor: Actor | null;
    jobId: string;
    input: unknown;
  }): Promise<{ status: JobStatus }> {
    const caller = deps.authorize(args.actor, PERMISSIONS.JOB_APPROVE);
    const input = parse(rejectJobInput, args.input);

    const status = await deps.store.transaction(async (tx) => {
      const row = await tx.findById(args.jobId);
      if (!row) throw new NotFoundError();

      const decision = decideReject(
        row,
        caller.userId,
        input.reviewNote,
        now()
      );
      if (!decision.ok) refuse(decision);

      const updated = await tx.update(row.id, row.status, decision.patch);
      if (!updated) throw new ConflictError("INVALID_STATE_TRANSITION");

      await tx.enqueue({
        type: "job.rejected",
        payload: {
          v: 1,
          jobId: row.id,
          postedBy: row.postedBy,
          actorId: caller.userId,
        },
      });
      await tx.audit({
        action: "job.rejected",
        actorId: caller.userId,
        jobId: row.id,
        postedBy: row.postedBy,
      });
      return decision.patch.status;
    });
    deps.observe?.("rejected", args.jobId);
    return { status };
  };
}
export type RejectJob = ReturnType<typeof createRejectJob>;
