import { PERMISSIONS } from "@nitap/database/permissions";

import type { Actor } from "@/modules/auth";

import { decodeCursor, encodeCursor } from "../domain/cursor";
import type { EmploymentType, WorkMode } from "../domain/job";
import type { Authorize } from "./authz";
import type { JobQueries, PublishedJobCard } from "./job-queries";
import { DEFAULT_LIMIT, MAX_LIMIT, type JobsPage } from "./list-my-jobs";

/** FR-JOB. The public listing (spec J-8/J-9/J-12): PUBLISHED, deadline >= current_date, exact-match filters. */
export function createListPublishedJobs(deps: {
  queries: JobQueries;
  authorize: Authorize;
}) {
  return async function listPublishedJobs(args: {
    actor: Actor | null;
    employmentType?: EmploymentType;
    workMode?: WorkMode;
    location?: string;
    limit?: number;
    cursor?: string;
  }): Promise<JobsPage<PublishedJobCard>> {
    deps.authorize(args.actor, PERMISSIONS.JOB_READ);
    const limit = Math.min(Math.max(1, args.limit ?? DEFAULT_LIMIT), MAX_LIMIT);

    const rows = await deps.queries.listPublished({
      employmentType: args.employmentType,
      workMode: args.workMode,
      location: args.location?.trim() || undefined,
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
export type ListPublishedJobs = ReturnType<typeof createListPublishedJobs>;
