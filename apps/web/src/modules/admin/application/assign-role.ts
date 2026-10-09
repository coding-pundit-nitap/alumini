import { PERMISSIONS, type Permission } from "@nitap/database/permissions";

import { NotFoundError, ValidationError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { checkRoleChange } from "../domain/escalation";
import { roleInputSchema } from "../domain/user-query";
import type { AccessStore } from "./access-store";
import { escalationError, guardTarget } from "./access-guards";
import type { Authorize, LoadGrants } from "./authorize-port";
import { toValidationError } from "./validation";

export type RoleDeps = {
  store: AccessStore;
  authorize: Authorize;
  loadGrants: LoadGrants;
  roles: Readonly<Record<string, readonly Permission[]>>;
  superAdminRole: string;
  now?: () => Date;
};

/** Validates a role name against the injected catalogue and applies E1. */
export function checkRole(
  deps: RoleDeps,
  actor: Actor,
  role: string,
  now: Date
) {
  // Own keys only: a path segment like `constructor` must not resolve through the prototype chain.
  const permissions = Object.hasOwn(deps.roles, role)
    ? deps.roles[role]
    : undefined;
  if (!permissions)
    throw new ValidationError({
      details: [{ field: "role", code: "INVALID", message: "Unknown role." }],
    });
  const reason = checkRoleChange(actor.grants, permissions, now);
  if (reason) throw escalationError(reason);
}

/** RBAC role.assigned.1, via authorize + checkRole + guardTarget. */
export function createAssignRole(deps: RoleDeps) {
  return async function assignRole(args: {
    actor: Actor | null;
    userId: string;
    input: unknown;
  }): Promise<{ roles: string[] }> {
    const actor = deps.authorize(args.actor, PERMISSIONS.ROLE_ASSIGN, {
      subjectUserId: args.userId,
      concealed: true,
    });
    const parsed = roleInputSchema.safeParse(args.input);
    if (!parsed.success) throw toValidationError(parsed.error);
    const { role } = parsed.data;
    const now = (deps.now ?? (() => new Date()))();
    checkRole(deps, actor, role, now);
    await guardTarget(deps.loadGrants, actor, args.userId, now);

    return deps.store.transaction(async (tx) => {
      const target = await tx.findUserForUpdate(args.userId);
      if (!target) throw new NotFoundError();
      await tx.insertUserRole(args.userId, role, actor.userId);
      await tx.audit({
        action: "role.assigned",
        actorId: actor.userId,
        targetUserId: args.userId,
        metadata: { role, previousRoles: target.roles },
      });
      return { roles: [...target.roles, role] };
    });
  };
}
export type AssignRole = ReturnType<typeof createAssignRole>;
