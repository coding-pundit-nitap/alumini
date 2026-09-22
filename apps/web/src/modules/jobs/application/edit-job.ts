import { PERMISSIONS } from "@nitap/database/permissions";

import { ConflictError, NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import {
  decideEdit,
  MATERIAL_FIELDS,
  type JobContent,
  type JobStatus,
} from "../domain/job";
import { editJobInput } from "../domain/validation";
import type { Authorize } from "./authz";
import type { JobObserver, JobStore } from "./job-store";
import { refuse } from "./refusal";
import { parse } from "./validation-parse";

const materialChanged = (row: JobContent, next: JobContent): boolean =>
  MATERIAL_FIELDS.some((field) => {
    if (field === "deadline")
      return row.deadline.getTime() !== next.deadline.getTime();
    return row[field] !== next[field];
  });

/**
 * FR-JOB-002, spec J-4. The poster's own-resource right, or `job.manage`, is resolved once the row is
 * loaded (the actor doesn't know the poster's id up front) and handed to the pure `decideEdit` as a flag.
 */
export function createEditJob(deps: {
  store: JobStore;
  authorize: Authorize;
  can: (actor: Actor, permission: string) => boolean;
  observe?: JobObserver;
}) {
  return async function editJob(args: {
    actor: Actor | null;
    jobId: string;
    input: unknown;
  }): Promise<{ status: JobStatus }> {
    const caller = deps.authorize(args.actor, PERMISSIONS.JOB_READ);
    const input = parse(editJobInput, args.input);

    const status = await deps.store.transaction(async (tx) => {
      const row = await tx.findById(args.jobId);
      if (!row) throw new NotFoundError();

      const isOwnerOrManager =
        caller.userId === row.postedBy ||
        deps.can(caller, PERMISSIONS.JOB_MANAGE);
      const decision = decideEdit(
        row,
        materialChanged(row, input),
        isOwnerOrManager
      );
      if (!decision.ok) refuse(decision);

      const updated = await tx.update(row.id, row.status, {
        ...input,
        ...decision.patch,
      });
      if (!updated) throw new ConflictError("INVALID_STATE_TRANSITION");

      if (decision.event) {
        await tx.enqueue({
          type: decision.event,
          payload: {
            v: 1,
            jobId: row.id,
            postedBy: row.postedBy,
            actorId: caller.userId,
          },
        });
      }
      return decision.patch.status;
    });
    if (status === "PENDING_REVIEW") deps.observe?.("submitted", args.jobId);
    return { status };
  };
}
export type EditJob = ReturnType<typeof createEditJob>;
