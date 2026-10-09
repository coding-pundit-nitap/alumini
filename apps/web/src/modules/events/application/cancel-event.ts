import { PERMISSIONS, type Permission } from "@nitap/database/permissions";

import { AppError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { decideCancelEvent, type RefusalCode } from "../domain/event";
import type {
  Authorize,
  EventObserver,
  EventStore,
  RefusalObserver,
} from "./ports";
import { refuse } from "./refusal";

/**
 * Organizer or `event.manage`, only while SCHEDULED. The guarded update
 * decides; `decideCancelEvent` only explains a miss. Observers run after the
 * transaction settles.
 */
export function createCancelEvent(deps: {
  store: EventStore;
  authorize: Authorize;
  can: (actor: Actor, permission: Permission) => boolean;
  observe?: EventObserver;
  observeRefusal?: RefusalObserver;
}) {
  return async function cancelEvent(args: {
    actor: Actor | null;
    eventId: string;
  }): Promise<{ eventId: string }> {
    const caller = deps.authorize(args.actor, PERMISSIONS.EVENT_READ);

    try {
      await deps.store.transaction(async (tx) => {
        const event = await tx.findEvent(args.eventId);
        const decision = decideCancelEvent(event, {
          userId: caller.userId,
          canManageAny: deps.can(caller, PERMISSIONS.EVENT_MANAGE),
        });
        if (!decision.ok) refuse(decision);

        const cancelled = await tx.cancelEvent(args.eventId);
        if (!cancelled) {
          // The guard's status check lost a race after we read it as SCHEDULED.
          refuse({ ok: false, code: "INVALID_STATE_TRANSITION" });
        }

        await tx.enqueue({
          type: "event.cancelled",
          payload: { v: 1, eventId: args.eventId, actorId: caller.userId },
        });
      });
      deps.observe?.("cancelled", args.eventId);
      return { eventId: args.eventId };
    } catch (error) {
      if (error instanceof AppError) {
        deps.observeRefusal?.(error.code as RefusalCode);
      }
      throw error;
    }
  };
}
export type CancelEvent = ReturnType<typeof createCancelEvent>;
