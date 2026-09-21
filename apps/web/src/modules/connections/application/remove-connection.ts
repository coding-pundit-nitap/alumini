import { PERMISSIONS } from "@nitap/database/permissions";

import { ConflictError, NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import {
  decideRemove,
  otherParty,
  type RemoveOutcome,
} from "../domain/connection";
import type { Authorize } from "./authz";
import type { ConnectionObserver, ConnectionStore } from "./connection-store";
import { refuse } from "./refusal";

/**
 * FR-NET-003 and the unblock half of FR-NET-004 (API spec §6.4): cancel your own request, remove an accepted
 * connection, or lift your own block. The row is deleted, so a later request starts clean. The delete is
 * guarded by the state the decision was made on.
 */
export function createRemoveConnection(deps: {
  store: ConnectionStore;
  authorize: Authorize;
  observe?: ConnectionObserver;
}) {
  return async function removeConnection(args: {
    actor: Actor | null;
    connectionId: string;
  }): Promise<{ outcome: RemoveOutcome }> {
    const caller = deps.authorize(args.actor, PERMISSIONS.CONNECTION_MANAGE);

    const result = await deps.store.transaction(async (tx) => {
      const row = await tx.findById(args.connectionId);
      if (!row) throw new NotFoundError();

      const decision = decideRemove(row, caller.userId);
      if (!decision.ok) refuse(decision);

      if (!(await tx.remove(row.id, row.state))) {
        throw new ConflictError("INVALID_STATE_TRANSITION");
      }
      if (decision.outcome === "unblocked") {
        await tx.audit({
          action: "connection.unblocked",
          actorId: caller.userId,
          targetUserId: otherParty(row, caller.userId),
          connectionId: row.id,
        });
      }
      return { outcome: decision.outcome };
    });
    deps.observe?.(result.outcome, args.connectionId);
    return result;
  };
}

export type RemoveConnection = ReturnType<typeof createRemoveConnection>;
