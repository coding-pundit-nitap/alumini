import { PERMISSIONS } from "@nitap/database/permissions";

import type { Actor } from "@/modules/auth";

import { decodeCursor, encodeCursor } from "../domain/cursor";
import type { MentorshipState } from "../domain/mentorship";
import type { Authorize } from "./authz";
import type { ListedMentorship, MentorshipQueries } from "./mentorship-store";

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;

export type MentorshipPage = {
  data: ListedMentorship[];
  page: { limit: number; nextCursor: string | null; hasMore: boolean };
};

/** The caller's own mentorships as a mentee ("my requests") or as a mentor (requests and mentees). */
export function createListMentorships(deps: {
  queries: MentorshipQueries;
  authorize: Authorize;
}) {
  return async function listMentorships(args: {
    actor: Actor | null;
    role: "mentor" | "mentee";
    states?: MentorshipState[];
    limit?: number;
    cursor?: string;
  }): Promise<MentorshipPage> {
    const caller = deps.authorize(
      args.actor,
      args.role === "mentor"
        ? PERMISSIONS.MENTORSHIP_RESPOND
        : PERMISSIONS.MENTORSHIP_REQUEST
    );
    const limit = Math.min(Math.max(1, args.limit ?? DEFAULT_LIMIT), MAX_LIMIT);

    const rows = await deps.queries.list(caller.userId, {
      role: args.role,
      states: args.states,
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
            ? encodeCursor({
                key: last.requestedAt.toISOString(),
                id: last.id,
              })
            : null,
        hasMore: more,
      },
    };
  };
}
export type ListMentorships = ReturnType<typeof createListMentorships>;
