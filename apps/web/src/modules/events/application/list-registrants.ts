import { PERMISSIONS, type Permission } from "@nitap/database/permissions";

import { AuthorizationError, NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { decodeCursor, encodeCursor } from "../domain/cursor";
import type { EventQueries, Registrant } from "./event-queries";
import type { Authorize } from "./ports";

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;

/**
 * The organizer or an `event.manage` holder only
 * ("returns FORBIDDEN", not concealed as NOT_FOUND — any `event.read` holder can already see
 * the event). Keyset by `(registered_at, id)`, same shape as `listEvents`.
 */
export function createListRegistrants(deps: {
  queries: EventQueries;
  authorize: Authorize;
  can: (actor: Actor, permission: Permission) => boolean;
}) {
  return async function listRegistrants(args: {
    actor: Actor | null;
    eventId: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ data: Registrant[]; page: { nextCursor: string | null } }> {
    const caller = deps.authorize(args.actor, PERMISSIONS.EVENT_READ);
    const limit = Math.min(Math.max(1, args.limit ?? DEFAULT_LIMIT), MAX_LIMIT);

    const event = await deps.queries.get(caller.userId, args.eventId);
    if (!event) throw new NotFoundError();
    const canManage =
      event.organizer.id === caller.userId ||
      deps.can(caller, PERMISSIONS.EVENT_MANAGE);
    if (!canManage) throw new AuthorizationError();

    const rows = await deps.queries.listRegistrants(args.eventId, {
      limit: limit + 1,
      after: args.cursor ? decodeCursor(args.cursor) : undefined,
    });

    const more = rows.length > limit;
    const kept = more ? rows.slice(0, limit) : rows;
    const last = kept.at(-1);
    return {
      data: kept,
      page: {
        nextCursor:
          more && last
            ? encodeCursor({
                key: last.registeredAt.toISOString(),
                id: last.registrationId,
              })
            : null,
      },
    };
  };
}
export type ListRegistrants = ReturnType<typeof createListRegistrants>;
