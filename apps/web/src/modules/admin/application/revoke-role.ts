import { PERMISSIONS } from "@nitap/database/permissions";

import { ConflictError, NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { guardTarget } from "./access-guards";
import { checkRole, type RoleDeps } from "./assign-role";

/** RBAC §9 role.revoked; §8.4 last Super Admin under the role-row lock (spec B12-5). */
export function createRevokeRole(deps: RoleDeps) {
  return async function revokeRole(args: {
    actor: Actor | null;
    userId: string;
    role: string;
  }): Promise<{ roles: string[] }> {
    const actor = deps.authorize(args.actor, PERMISSIONS.ROLE_ASSIGN, {
      subjectUserId: args.userId,
      concealed: true,
    });
    const now = (deps.now ?? (() => new Date()))();
    checkRole(deps, actor, args.role, now);
    await guardTarget(deps.loadGrants, actor, args.userId, now);

    return deps.store.transaction(async (tx) => {
      const target = await tx.findUserForUpdate(args.userId);
      if (!target || !target.roles.includes(args.role))
        throw new NotFoundError();
      if (args.role === deps.superAdminRole) {
        const active = await tx.lockSuperAdmins();
        if (active.length <= 1 && active.includes(args.userId))
          throw new ConflictError("LAST_SUPER_ADMIN");
      }
      await tx.deleteUserRole(args.userId, args.role);
      await tx.audit({
        action: "role.revoked",
        actorId: actor.userId,
        targetUserId: args.userId,
        metadata: { role: args.role, previousRoles: target.roles },
      });
      return { roles: target.roles.filter((r) => r !== args.role) };
    });
  };
}
export type RevokeRole = ReturnType<typeof createRevokeRole>;
