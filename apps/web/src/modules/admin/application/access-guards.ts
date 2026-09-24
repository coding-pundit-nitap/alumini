import { AuthorizationError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import {
  checkTarget,
  ESCALATION_MESSAGES,
  type EscalationReason,
} from "../domain/escalation";
import type { LoadGrants } from "./authorize-port";

export const escalationError = (reason: EscalationReason) =>
  new AuthorizationError({
    code: "ACCESS_ESCALATION_FORBIDDEN",
    message: ESCALATION_MESSAGES[reason],
  });

/** E3 (spec B12-3, B12-8): runs after authorize, before the transaction. */
export async function guardTarget(
  loadGrants: LoadGrants,
  actor: Actor,
  targetId: string,
  now: Date
) {
  const reason = checkTarget(
    actor.grants,
    await loadGrants(targetId, now),
    now
  );
  if (reason) throw escalationError(reason);
}
