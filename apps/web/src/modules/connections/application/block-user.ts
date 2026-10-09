import { PERMISSIONS } from "@nitap/database/permissions";

import { ConflictError, NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { canonicalPair, decideBlock } from "../domain/connection";
import type { Authorize } from "./authz";
import type {
  ConnectionObserver,
  ConnectionStore,
  ConnectionTx,
} from "./connection-store";
import { cannotConnectSelf, refuse } from "./refusal";

/**
 * Works with or without a prior request and replaces the pair's current state.
 * Lift it with `removeConnection` on the blocked row.
 */
export function createBlockUser(deps: {
  store: ConnectionStore;
  authorize: Authorize;
  observe?: ConnectionObserver;
  now?: () => Date;
}) {
  const now = deps.now ?? (() => new Date());

  return async function blockUser(args: {
    actor: Actor | null;
    targetUserId: string;
  }): Promise<{ connectionId: string }> {
    const caller = deps.authorize(args.actor, PERMISSIONS.CONNECTION_MANAGE);
    const targetId = args.targetUserId.toLowerCase();
    if (targetId === caller.userId.toLowerCase()) throw cannotConnectSelf();
    const pair = canonicalPair(caller.userId, targetId);
    const recorded = async (tx: ConnectionTx, connectionId: string) => {
      changed = true;
      await tx.audit({
        action: "connection.blocked",
        actorId: caller.userId,
        targetUserId: targetId,
        connectionId,
      });
      return { connectionId };
    };

    let changed = false;
    const result = await deps.store.transaction(async (tx) => {
      changed = false;
      if ((await tx.accountState(targetId)) === null) throw new NotFoundError();

      let existing = await tx.findByPair(pair.userAId, pair.userBId);
      for (let pass = 0; pass < 2; pass += 1) {
        const decision = decideBlock(existing, caller.userId, now());
        if (!decision.ok) refuse(decision);
        if (decision.action === "noop" && existing) {
          return { connectionId: existing.id };
        }

        if (decision.action === "create") {
          const created = await tx.insert({ ...pair, ...decision.patch });
          if (created) return await recorded(tx, created.id);
          existing = await tx.findByPair(pair.userAId, pair.userBId);
          continue;
        }

        const updated = existing
          ? await tx.update(existing.id, existing.state, decision.patch)
          : null;
        if (!updated) throw new ConflictError("INVALID_STATE_TRANSITION");
        return await recorded(tx, updated.id);
      }
      throw new ConflictError("INVALID_STATE_TRANSITION");
    });
    if (changed) deps.observe?.("blocked", result.connectionId);
    return result;
  };
}

export type BlockUser = ReturnType<typeof createBlockUser>;
