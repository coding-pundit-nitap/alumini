import { PERMISSIONS, type Permission } from "@nitap/database/permissions";

import { AppError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { decideAttendance, type RefusalCode } from "../domain/event";
import type {
  Authorize,
  EventObserver,
  EventStore,
  RefusalObserver,
} from "./ports";
import { refuse } from "./refusal";

/**
 * FR-EVENT (E-4). The organizer or an `event.manage` holder, only after `starts_at`, on a
 * non-cancelled registration. `markAttendance` (the guarded UPDATE) is the one write that decides;
 * `decideAttendance` only classifies a permission or state miss ahead of it. The row and
 * `event.attendance-marked` commit in one transaction; `observe`/`observeRefusal` run only after
 * that transaction settles.
 */
export function createMarkAttendance(deps: {
  store: EventStore;
  authorize: Authorize;
  can: (actor: Actor, permission: Permission) => boolean;
  observe?: EventObserver;
  observeRefusal?: RefusalObserver;
  now?: () => Date;
}) {
  const now = deps.now ?? (() => new Date());

  return async function markAttendance(args: {
    actor: Actor | null;
    eventId: string;
    registrationId: string;
    state: "ATTENDED" | "NO_SHOW";
  }): Promise<{ registrationId: string }> {
    const caller = deps.authorize(args.actor, PERMISSIONS.EVENT_READ);

    try {
      await deps.store.transaction(async (tx) => {
        const event = await tx.findEvent(args.eventId);
        const current = await tx.findRegistration(args.eventId, {
          registrationId: args.registrationId,
        });
        const decision = decideAttendance(
          event,
          current?.state ?? null,
          {
            userId: caller.userId,
            canManageAny: deps.can(caller, PERMISSIONS.EVENT_MANAGE),
          },
          now()
        );
        if (!decision.ok) refuse(decision);

        const marked = await tx.markAttendance(
          args.eventId,
          args.registrationId,
          args.state
        );
        if (!marked) {
          // The guard's state check lost a race after we read it as markable.
          refuse({ ok: false, code: "INVALID_STATE_TRANSITION" });
        }

        await tx.enqueue({
          type: "event.attendance-marked",
          payload: {
            v: 1,
            eventId: args.eventId,
            registrationId: marked.id,
            userId: marked.userId,
            actorId: caller.userId,
          },
        });
      });
      deps.observe?.("attendance_marked", args.eventId);
      return { registrationId: args.registrationId };
    } catch (error) {
      if (error instanceof AppError) {
        deps.observeRefusal?.(error.code as RefusalCode);
      }
      throw error;
    }
  };
}
export type MarkAttendance = ReturnType<typeof createMarkAttendance>;
