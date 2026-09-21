import { PERMISSIONS } from "@nitap/database/permissions";

import { ConflictError, NotFoundError, RateLimitedError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { canonicalPair, decideRequest } from "../domain/connection";
import type { Authorize } from "./authz";
import type { ConnectionObserver, ConnectionStore } from "./connection-store";
import { cannotConnectSelf, refuse } from "./refusal";

/** `connections.create`: 20 requests an hour per member, the brake on mass invitations (API spec §6.1). */
export const REQUEST_RATE = { max: 20, window: 60 * 60 } as const;

export type RateLimiter = {
  consume(
    key: string,
    rule: { max: number; window: number }
  ): Promise<{ allowed: boolean; retryAfter: number | null }>;
};

export type RequestConnectionResult = { connectionId: string };

/**
 * FR-NET-001. The row and its `connection.requested` event commit together. Two members asking each other at
 * the same instant end with ONE row: the loser's insert is a no-op on the unique pair, it re-reads, and the
 * pair's state then refuses it as CONNECTION_EXISTS (the client should accept instead).
 */
export function createRequestConnection(deps: {
  store: ConnectionStore;
  authorize: Authorize;
  rateLimiter: RateLimiter;
  observe?: ConnectionObserver;
  now?: () => Date;
}) {
  const now = deps.now ?? (() => new Date());

  return async function requestConnection(args: {
    actor: Actor | null;
    recipientId: string;
  }): Promise<RequestConnectionResult> {
    const caller = deps.authorize(args.actor, PERMISSIONS.CONNECTION_MANAGE);
    const recipientId = args.recipientId.toLowerCase();
    if (recipientId === caller.userId.toLowerCase()) throw cannotConnectSelf();

    const verdict = await deps.rateLimiter.consume(
      `connections.create:${caller.userId}`,
      REQUEST_RATE
    );
    if (!verdict.allowed) throw new RateLimitedError(verdict.retryAfter ?? 60);

    const pair = canonicalPair(caller.userId, recipientId);
    const event = (connectionId: string) => ({
      type: "connection.requested" as const,
      payload: {
        v: 1 as const,
        connectionId,
        actorId: caller.userId,
        recipientId,
      },
    });

    const result = await deps.store.transaction(async (tx) => {
      // Not a verified member reads the same as no such member.
      if ((await tx.accountState(recipientId)) !== "VERIFIED") {
        throw new NotFoundError();
      }

      let existing = await tx.findByPair(pair.userAId, pair.userBId);
      // Two passes at most: a lost insert race turns "no row" into a row that decides the outcome.
      for (let pass = 0; pass < 2; pass += 1) {
        const decision = decideRequest(existing, caller.userId, now());
        if (!decision.ok) refuse(decision);

        if (decision.action === "create") {
          const created = await tx.insert({
            ...pair,
            state: "PENDING",
            requestedById: caller.userId,
            requestedAt: now(),
            respondedAt: null,
            blockedById: null,
          });
          if (created) {
            await tx.enqueue(event(created.id));
            return { connectionId: created.id };
          }
          existing = await tx.findByPair(pair.userAId, pair.userBId);
          continue;
        }

        const reopened = existing
          ? await tx.update(existing.id, "REJECTED", decision.patch!)
          : null;
        if (!reopened) throw new ConflictError("CONNECTION_EXISTS");
        await tx.enqueue(event(reopened.id));
        return { connectionId: reopened.id };
      }
      throw new ConflictError("CONNECTION_EXISTS");
    });
    deps.observe?.("requested", result.connectionId);
    return result;
  };
}

export type RequestConnection = ReturnType<typeof createRequestConnection>;
