import { PERMISSIONS } from "@nitap/database/permissions";

import type { Actor } from "@/modules/auth";

import { decodeCursor, encodeCursor } from "../domain/cursor";
import type { Authorize } from "./authz";
import type { JobQueries, ListedJob } from "./job-queries";

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;

export type JobsPage<T> = {
  data: T[];
  page: { limit: number; nextCursor: string | null; hasMore: boolean };
};

/** The caller's own postings, any status. */
export function createListMyJobs(deps: {
  queries: JobQueries;
  authorize: Authorize;
}) {
  return async function listMyJobs(args: {
    actor: Actor | null;
    limit?: number;
    cursor?: string;
  }): Promise<JobsPage<ListedJob>> {
    const caller = deps.authorize(args.actor, PERMISSIONS.JOB_READ);
    const limit = Math.min(Math.max(1, args.limit ?? DEFAULT_LIMIT), MAX_LIMIT);

    const rows = await deps.queries.listMine(caller.userId, {
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
export type ListMyJobs = ReturnType<typeof createListMyJobs>;
