import { PERMISSIONS } from "@nitap/database/permissions";

import type { Actor } from "@/modules/auth";

import { decodeCursor, encodeCursor } from "../domain/cursor";
import type { EventQueries, EventSummary } from "./event-queries";
import type { Authorize } from "./ports";

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;

/** FR-EVENT-002, spec E-10. Scope and cancelled-visibility are applied by the query. */
export function createListEvents(deps: {
  queries: EventQueries;
  authorize: Authorize;
}) {
  return async function listEvents(args: {
    actor: Actor | null;
    scope: "upcoming" | "mine" | "past";
    includeCancelled?: boolean;
    limit?: number;
    cursor?: string;
  }): Promise<{ data: EventSummary[]; page: { nextCursor: string | null } }> {
    const caller = deps.authorize(args.actor, PERMISSIONS.EVENT_READ);
    const limit = Math.min(Math.max(1, args.limit ?? DEFAULT_LIMIT), MAX_LIMIT);

    const rows = await deps.queries.list(caller.userId, {
      scope: args.scope,
      includeCancelled: args.includeCancelled ?? false,
      limit: limit + 1,
      after: args.cursor ? decodeCursor(args.cursor) : undefined,
    });

    const more = rows.length > limit;
    const kept = more ? rows.slice(0, limit) : rows;
    const last = kept.at(-1);
    return {
      data: kept.map((row) => ({
        ...row,
        spotsRemaining: row.capacity - row.registeredCount,
      })),
      page: {
        nextCursor:
          more && last
            ? encodeCursor({ key: last.startsAt.toISOString(), id: last.id })
            : null,
      },
    };
  };
}
export type ListEvents = ReturnType<typeof createListEvents>;
