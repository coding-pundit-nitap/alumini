import { PERMISSIONS, type Permission } from "@nitap/database/permissions";

import { NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import type { EventDetail, EventQueries } from "./event-queries";
import type { Authorize } from "./ports";

/** `canManage` is the organizer or an `event.manage` holder. */
export function createGetEvent(deps: {
  queries: EventQueries;
  authorize: Authorize;
  can: (actor: Actor, permission: Permission) => boolean;
}) {
  return async function getEvent(args: {
    actor: Actor | null;
    eventId: string;
  }): Promise<EventDetail> {
    const caller = deps.authorize(args.actor, PERMISSIONS.EVENT_READ);
    const row = await deps.queries.get(caller.userId, args.eventId);
    if (!row) throw new NotFoundError();

    return {
      ...row,
      spotsRemaining: row.capacity - row.registeredCount,
      canManage:
        row.organizer.id === caller.userId ||
        deps.can(caller, PERMISSIONS.EVENT_MANAGE),
    };
  };
}
export type GetEvent = ReturnType<typeof createGetEvent>;
