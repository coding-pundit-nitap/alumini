import { UnexpectedError } from "@/lib/errors";

import { isAccountState, type Actor } from "../domain/actor";
import type { GrantSource } from "./grant-source";

/** What the session layer knows about the caller. `accountState` is untrusted until checked. */
export type SessionIdentity = { userId: string; accountState: unknown };

/** Only VERIFIED accounts have permissions, so grants are not queried otherwise. */
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
