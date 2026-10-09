import { PERMISSIONS } from "@nitap/database/permissions";

import type { Actor } from "@/modules/auth";

import { decodeCursor, encodeCursor } from "../domain/cursor";
import type { Authorize } from "./authz";
import type { JobQueries, ListedJob } from "./job-queries";
import { DEFAULT_LIMIT, MAX_LIMIT, type JobsPage } from "./list-my-jobs";

/**
 * The moderation queue: PENDING_REVIEW only, oldest first, job.approve
 * required.
 */
export function createListPendingJobs(deps: {
  queries: JobQueries;
  authorize: Authorize;
}) {
  return async function listPendingJobs(args: {
    actor: Actor | null;
    limit?: number;
    cursor?: string;
  }): Promise<JobsPage<ListedJob>> {
    deps.authorize(args.actor, PERMISSIONS.JOB_APPROVE);
    const limit = Math.min(Math.max(1, args.limit ?? DEFAULT_LIMIT), MAX_LIMIT);

    const rows = await deps.queries.listPending({
      limit: limit + 1,
      after: args.cursor ? decodeCursor(args.cursor) : undefined,
    });

    const more = rows.length > limit;
    const data = more ? rows.slice(0, limit) : rows;
    const last = data.at(-1);
    return {
      data,
      page: {
        limit,
        nextCursor:
          more && last
            ? encodeCursor({ key: last.createdAt.toISOString(), id: last.id })
            : null,
        hasMore: more,
      },
    };
  };
}
export type ListPendingJobs = ReturnType<typeof createListPendingJobs>;
