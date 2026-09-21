import { PERMISSIONS } from "@nitap/database/permissions";

import { ConflictError, NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { canonicalPair, decideBlock } from "../domain/connection";
import type { Authorize } from "./authz";
import type { ConnectionStore } from "./connection-store";
import { cannotConnectSelf, refuse } from "./refusal";

/**
 * FR-NET-004. Blocking works with or without a prior request and replaces whatever state the pair was in
 * (a pending request or an accepted connection ends). It is by member, not by connection, so it can be done
 * from a profile page. Lifting it is `removeConnection` on the blocked row.
 */
export function createBlockUser(deps: {
  store: ConnectionStore;
  authorize: Authorize;
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

    return deps.store.transaction(async (tx) => {
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
          if (created) return { connectionId: created.id };
          existing = await tx.findByPair(pair.userAId, pair.userBId);
          continue;
        }

        const updated = existing
          ? await tx.update(existing.id, existing.state, decision.patch)
          : null;
        if (!updated) throw new ConflictError("INVALID_STATE_TRANSITION");
        return { connectionId: updated.id };
      }
      throw new ConflictError("INVALID_STATE_TRANSITION");
    });
  };
}

export type BlockUser = ReturnType<typeof createBlockUser>;
