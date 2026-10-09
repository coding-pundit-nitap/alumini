import { UnexpectedError } from "@/lib/errors";

import { isAccountState, type Actor } from "../domain/actor";
import type { GrantSource } from "./grant-source";

/** What the session layer knows about the caller. `accountState` is untrusted until checked. */
export type SessionIdentity = { userId: string; accountState: unknown };

/**
 * Builds the Actor for one request. Only VERIFIED accounts hold effective permissions, so
 * grants are not even queried for any other state.
 */
export async function resolveActor(
  deps: { grantSource: GrantSource; now: () => Date },
  identity: SessionIdentity,
  requestId: string
): Promise<Actor> {
  const { userId, accountState } = identity;
  if (!isAccountState(accountState)) {
    throw new UnexpectedError(
      `User ${userId} has an unknown account state: ${String(accountState)}`
    );
  }
  const grants =
    accountState === "VERIFIED"
      ? await deps.grantSource.loadGrants(userId, deps.now())
      : [];
  return { userId, accountState, requestId, grants };
}
