import { PERMISSIONS } from "@nitap/database/permissions";

import type { Actor } from "@/modules/auth";

import { decodeCursor, encodeCursor } from "../domain/cursor";
import type { Authorize } from "./authz";
import type { MentorCard, MentorQueries } from "./mentor-ports";

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;

export type MentorPage = {
  data: Omit<MentorCard, "sortKey">[];
  page: { limit: number; nextCursor: string | null; hasMore: boolean };
};

/** FR-MENTOR-003. Visibility, blocks and "active mentor" are applied by the query (spec M-2, M-8). */
export function createListMentors(deps: {
  queries: MentorQueries;
  authorize: Authorize;
}) {
  return async function listMentors(args: {
    actor: Actor | null;
    topic?: string;
    department?: string;
    company?: string;
    limit?: number;
    cursor?: string;
  }): Promise<MentorPage> {
    const caller = deps.authorize(args.actor, PERMISSIONS.MENTOR_SEARCH);
    const limit = Math.min(Math.max(1, args.limit ?? DEFAULT_LIMIT), MAX_LIMIT);

    const rows = await deps.queries.list(caller.userId, {
      topic: args.topic?.trim().toLowerCase() || undefined,
      department: args.department || undefined,
      company: args.company?.trim() || undefined,
      limit: limit + 1,
      after: args.cursor ? decodeCursor(args.cursor) : undefined,
    });

    const more = rows.length > limit;
    const kept = more ? rows.slice(0, limit) : rows;
    const last = kept.at(-1);
    return {
      data: kept.map((card) => {
        const { sortKey, ...rest } = card;
        void sortKey;
        return rest;
      }),
      page: {
        limit,
        nextCursor:
          more && last
            ? encodeCursor({ key: last.sortKey, id: last.userId })
            : null,
        hasMore: more,
      },
    };
  };
}
export type ListMentors = ReturnType<typeof createListMentors>;
