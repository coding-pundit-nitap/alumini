import { UnexpectedError } from "@/lib/errors";

import type { MemberStore } from "./member-store";

/**
 * Idempotent, so sign-up, email verification and getActor() can all call it. Assigns no role; that
 * comes with the VERIFIED transition.
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
