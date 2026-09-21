import { UnexpectedError } from "@/lib/errors";

import type { MemberStore } from "./member-store";

/**
 * Makes sure a signed-up user has a profile row (FR-PROFILE-001). Idempotent, so it can be called from
 * the post-commit sign-up hook, from email verification and from getActor() as a repair. It assigns no
 * role: RBAC §7 denies role-derived permissions to PENDING accounts, and the role arrives with the
 * VERIFIED transition (spec 2C, D-4).
 */
export function createProvisionMember(deps: { store: MemberStore }) {
  return async function provisionMember(
    userId: string
  ): Promise<{ created: boolean }> {
    return deps.store.transaction(async (tx) => {
      const user = await tx.findUser(userId);
      if (!user) {
        throw new UnexpectedError(`Cannot provision unknown user ${userId}`);
      }
      return { created: await tx.ensureProfile(user.id, user.name) };
    });
  };
}

export type ProvisionMember = ReturnType<typeof createProvisionMember>;
