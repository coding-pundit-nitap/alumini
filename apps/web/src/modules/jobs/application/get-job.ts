import { PERMISSIONS } from "@nitap/database/permissions";

import { NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import type { JobRow } from "../domain/job";
import type { Authorize } from "./authz";
import type { JobQueries } from "./job-queries";

/** FR-JOB, spec J-8. A non-visible job (wrong status, wrong caller) reads as NOT_FOUND, never FORBIDDEN. */
export function createGetJob(deps: {
  queries: JobQueries;
  authorize: Authorize;
  can: (actor: Actor, permission: string) => boolean;
}) {
  return async function getJob(args: {
    actor: Actor | null;
    jobId: string;
  }): Promise<JobRow> {
    const caller = deps.authorize(args.actor, PERMISSIONS.JOB_READ);
    const row = await deps.queries.get(args.jobId);
    if (!row) throw new NotFoundError();

    const visible =
      row.status === "PUBLISHED" ||
      row.postedBy === caller.userId ||
      deps.can(caller, PERMISSIONS.JOB_APPROVE) ||
      deps.can(caller, PERMISSIONS.JOB_MANAGE);
    if (!visible) throw new NotFoundError();

    return row;
  };
}
export type GetJob = ReturnType<typeof createGetJob>;
