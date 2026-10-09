import { PERMISSIONS } from "@nitap/database/permissions";

import { ConflictError, NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { decideRespond, otherParty } from "../domain/connection";
import type { Authorize } from "./authz";
import type { ConnectionObserver, ConnectionStore } from "./connection-store";
import { refuse } from "./refusal";

/** Recipient only. The guarded update gives a racing accept and cancel exactly one winner. */
export function createRespondToConnection(deps: {
  store: ConnectionStore;
  authorize: Authorize;
  observe?: ConnectionObserver;
  now?: () => Date;
}) {
  const now = deps.now ?? (() => new Date());

  return async function respondToConnection(args: {
    actor: Actor | null;
    connectionId: string;
    decision: "ACCEPT" | "REJECT";
  }): Promise<{ state: "ACCEPTED" | "REJECTED" }> {
    const caller = deps.authorize(args.actor, PERMISSIONS.CONNECTION_MANAGE);
    const to = args.decision === "ACCEPT" ? "ACCEPTED" : "REJECTED";

    await deps.store.transaction(async (tx) => {
      const row = await tx.findById(args.connectionId);
      if (!row) throw new NotFoundError();

      const decision = decideRespond(row, caller.userId, to, now());
      if (!decision.ok) refuse(decision);

      const updated = await tx.update(row.id, "PENDING", decision.patch);
      if (!updated) throw new ConflictError("INVALID_STATE_TRANSITION");

      if (to === "ACCEPTED") {
        await tx.enqueue({
          type: "connection.accepted",
          payload: {
            v: 1,
            connectionId: row.id,
            actorId: caller.userId,
            recipientId: otherParty(row, caller.userId),
          },
        });
      }
    });
    deps.observe?.(
      to === "ACCEPTED" ? "accepted" : "rejected",
      args.connectionId
    );
    return { state: to };
  };
}

export type RespondToConnection = ReturnType<typeof createRespondToConnection>;
