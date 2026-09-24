import { PERMISSIONS } from "@nitap/database/permissions";

import { ConflictError, NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import {
  canTransition,
  STATE_AUDIT_ACTION,
  type TargetState,
} from "../domain/lifecycle";
import { accountStateInputSchema } from "../domain/user-query";
import type { AccessStore } from "./access-store";
import { guardTarget } from "./access-guards";
import type { Authorize, LoadGrants } from "./authorize-port";
import { toValidationError } from "./validation";

/**
 * Suspend, deactivate or reactivate (spec B12-1). The requested state picks the permission, so the raw
 * field is read before validation; anything that is not "VERIFIED" needs user.suspend.
 */
export function createChangeAccountState(deps: {
  store: AccessStore;
  authorize: Authorize;
  loadGrants: LoadGrants;
  superAdminRole: string;
  now?: () => Date;
}) {
  return async function changeAccountState(args: {
    actor: Actor | null;
    userId: string;
    input: unknown;
  }): Promise<{ accountState: TargetState }> {
    const requested = (args.input as { accountState?: unknown } | null)
      ?.accountState;
    const permission =
      requested === "VERIFIED"
        ? PERMISSIONS.USER_REACTIVATE
        : PERMISSIONS.USER_SUSPEND;
    const actor = deps.authorize(args.actor, permission, {
      subjectUserId: args.userId,
      concealed: true,
    });

    const parsed = accountStateInputSchema.safeParse(args.input);
    if (!parsed.success) throw toValidationError(parsed.error);
    const { accountState: to, reason } = parsed.data;
    const now = (deps.now ?? (() => new Date()))();

    await guardTarget(deps.loadGrants, actor, args.userId, now);

    return deps.store.transaction(async (tx) => {
      const target = await tx.findUserForUpdate(args.userId);
      if (!target) throw new NotFoundError();
      const previousState = target.accountState;
      const invalid = () =>
        new ConflictError("INVALID_STATE_TRANSITION", {
          details: [{ currentState: previousState, requestedState: to }],
        });
      if (!canTransition(previousState, to)) throw invalid();

      if (to !== "VERIFIED" && target.roles.includes(deps.superAdminRole)) {
        const active = await tx.lockSuperAdmins();
        if (active.length <= 1 && active.includes(args.userId))
          throw new ConflictError("LAST_SUPER_ADMIN");
      }

      const moved = await tx.setAccountState(
        args.userId,
        previousState,
        to,
        to === "DEACTIVATED" ? now : null
      );
      if (!moved) throw invalid();
      const sessionsRevoked =
        to === "VERIFIED" ? 0 : await tx.deleteSessions(args.userId);

      await tx.audit({
        action: STATE_AUDIT_ACTION[to],
        actorId: actor.userId,
        targetUserId: args.userId,
        metadata:
          to === "VERIFIED"
            ? { previousState }
            : { reason: reason ?? null, previousState, sessionsRevoked },
      });
      return { accountState: to };
    });
  };
}
export type ChangeAccountState = ReturnType<typeof createChangeAccountState>;
