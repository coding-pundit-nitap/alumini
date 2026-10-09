import { PERMISSIONS } from "@nitap/database/permissions";

import { NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { checkGrantChange } from "../domain/escalation";
import { escalationError, guardTarget } from "./access-guards";
import { grantAuditMetadata, type GrantDeps } from "./grant-permission";

/** Revoking needs the same holding as granting (E2), checked against the stored row. */
export function createRevokeGrant(deps: GrantDeps) {
  return async function revokeGrant(args: {
    actor: Actor | null;
    userId: string;
    grantId: string;
  }): Promise<void> {
    const actor = deps.authorize(args.actor, PERMISSIONS.PERMISSION_GRANT, {
      subjectUserId: args.userId,
      concealed: true,
    });
    const now = (deps.now ?? (() => new Date()))();
    await guardTarget(deps.loadGrants, actor, args.userId, now);

    await deps.store.transaction(async (tx) => {
      if (!(await tx.findUserForUpdate(args.userId))) throw new NotFoundError();
      const grant = await tx.findGrant(args.userId, args.grantId);
      if (!grant) throw new NotFoundError();
      const reason = checkGrantChange(actor.grants, grant, now);
      if (reason) throw escalationError(reason);
      await tx.deleteGrant(grant.id);
      await tx.audit({
        action: "permission.revoked",
        actorId: actor.userId,
        targetUserId: args.userId,
        metadata: grantAuditMetadata(grant),
      });
    });
  };
}
export type RevokeGrant = ReturnType<typeof createRevokeGrant>;
