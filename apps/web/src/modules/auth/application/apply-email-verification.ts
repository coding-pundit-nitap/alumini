import { UnexpectedError } from "@/lib/errors";

import { classifyEmail, type EmailPolicy } from "../domain/email-policy";
import type { MemberStore } from "./member-store";

export type ApplyResult =
  | { outcome: "verified"; role: string }
  | { outcome: "pending" }
  | { outcome: "unchanged" };

/**
 * A confirmed institutional address with `autoVerify` becomes VERIFIED with its mapped role. Acts
 * only on PENDING accounts, so it is idempotent and cannot revive any other state.
 */
export function createApplyEmailVerification(deps: {
  store: MemberStore;
  policy: () => EmailPolicy;
}) {
  return async function applyEmailVerification(
    userId: string
  ): Promise<ApplyResult> {
    return deps.store.transaction(async (tx): Promise<ApplyResult> => {
      const user = await tx.findUser(userId);
      if (!user) {
        throw new UnexpectedError(`Cannot verify unknown user ${userId}`);
      }
      if (user.accountState !== "PENDING") return { outcome: "unchanged" };
      if (!user.emailVerified) return { outcome: "pending" };

      const emailClass = classifyEmail(user.email, deps.policy());
      if (emailClass.kind !== "INSTITUTIONAL" || !emailClass.autoVerify) {
        return { outcome: "pending" };
      }

      if (!(await tx.markVerified(userId))) return { outcome: "unchanged" };
      // Policy grants are recorded as granted by the user themselves, the convention the bootstrap
      // seed uses; nobody holds role.assign over their own account.
      await tx.assignRole(userId, emailClass.role, userId);
      return { outcome: "verified", role: emailClass.role };
    });
  };
}

export type ApplyEmailVerification = ReturnType<
  typeof createApplyEmailVerification
>;
