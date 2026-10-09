import { PERMISSIONS } from "@nitap/database/permissions";

import { AppError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { decideCancelRegistration, type RefusalCode } from "../domain/event";
import type {
  Authorize,
  EventObserver,
  EventStore,
  RefusalObserver,
} from "./ports";
import { refuse } from "./refusal";

/** The guarded `releaseSeat` update decides; this only explains a miss. */
export function createCancelRegistration(deps: {
  store: EventStore;
  authorize: Authorize;
  observe?: EventObserver;
  observeRefusal?: RefusalObserver;
  now?: () => Date;
}) {
  const now = deps.now ?? (() => new Date());

  return async function cancelRegistration(args: {
    actor: Actor | null;
    eventId: string;
  }): Promise<{ registrationId: string }> {
    const caller = deps.authorize(args.actor, PERMISSIONS.EVENT_REGISTER);

    try {
      const result = await deps.store.transaction(async (tx) => {
        const released = await tx.releaseSeat(args.eventId);
        if (!released) {
          const event = await tx.findEvent(args.eventId);
          const own = await tx.findRegistration(args.eventId, {
            userId: caller.userId,
          });
          refuse(decideCancelRegistration(event, own?.state ?? null, now()));
        }

        const cancelled = await tx.cancelRegistration(
          args.eventId,
          caller.userId
        );
        if (!cancelled) {
          // releaseSeat succeeded but the caller's own row wasn't REGISTERED; rolls back the release.
          const own = await tx.findRegistration(args.eventId, {
            userId: caller.userId,
          });
          refuse(
            own === null || own.state === "CANCELLED"
              ? { ok: false, code: "NOT_FOUND" }
              : { ok: false, code: "INVALID_STATE_TRANSITION" }
          );
        }

        await tx.enqueue({
          type: "event.registration-cancelled",
          payload: {
            v: 1,
            eventId: args.eventId,
            registrationId: cancelled.id,
            userId: caller.userId,
            actorId: caller.userId,
          },
        });
        return { registrationId: cancelled.id };
      });
      deps.observe?.("registration_cancelled", args.eventId);
      return result;
    } catch (error) {
      if (error instanceof AppError) {
        deps.observeRefusal?.(error.code as RefusalCode);
      }
      throw error;
    }
  };
}
export type CancelRegistration = ReturnType<typeof createCancelRegistration>;
