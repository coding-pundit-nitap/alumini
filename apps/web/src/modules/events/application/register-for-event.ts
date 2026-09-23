import { PERMISSIONS } from "@nitap/database/permissions";

import { AppError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { classifyRegistrationRefusal, type RefusalCode } from "../domain/event";
import type {
  Authorize,
  EventObserver,
  EventStore,
  RefusalObserver,
} from "./ports";
import { refuse } from "./refusal";

/**
 * FR-EVENT-005 (E-5). `claimSeat` is the one guarded UPDATE that decides admission; this only
 * classifies its miss for the caller. The row, the registration and `event.registered` commit in
 * one transaction; `observe`/`observeRefusal` run only after that transaction settles.
 */
export function createRegisterForEvent(deps: {
  store: EventStore;
  authorize: Authorize;
  observe?: EventObserver;
  observeRefusal?: RefusalObserver;
  now?: () => Date;
}) {
  const now = deps.now ?? (() => new Date());

  return async function registerForEvent(args: {
    actor: Actor | null;
    eventId: string;
  }): Promise<{ registrationId: string }> {
    const caller = deps.authorize(args.actor, PERMISSIONS.EVENT_REGISTER);

    try {
      const result = await deps.store.transaction(async (tx) => {
        const claimed = await tx.claimSeat(args.eventId);
        if (!claimed) {
          const event = await tx.findEvent(args.eventId);
          const own = await tx.findRegistration(args.eventId, {
            userId: caller.userId,
          });
          refuse(classifyRegistrationRefusal(event, own?.state ?? null, now()));
        }

        const registration = await tx.upsertRegistration(
          args.eventId,
          caller.userId
        );
        if (!registration) {
          // claimSeat succeeded but a concurrent registration beat us to the row; rolls back the claim.
          refuse({ ok: false, code: "ALREADY_REGISTERED" });
        }

        await tx.enqueue({
          type: "event.registered",
          payload: {
            v: 1,
            eventId: args.eventId,
            registrationId: registration.id,
            userId: caller.userId,
            actorId: caller.userId,
          },
        });
        return { registrationId: registration.id };
      });
      deps.observe?.("registered", args.eventId);
      return result;
    } catch (error) {
      if (error instanceof AppError) {
        deps.observeRefusal?.(error.code as RefusalCode);
      }
      throw error;
    }
  };
}
export type RegisterForEvent = ReturnType<typeof createRegisterForEvent>;
