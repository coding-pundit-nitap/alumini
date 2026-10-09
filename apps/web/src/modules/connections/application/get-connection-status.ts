import { PERMISSIONS } from "@nitap/database/permissions";

import type { Actor } from "@/modules/auth";

import { statusFor, type ConnectionStatus } from "../domain/connection";
import type { Authorize } from "./authz";
import type { ConnectionQueries } from "./connection-store";

/**
 * What the profile page's connect button shows: the viewer's side of the pair
 * with one other member.
 */
export function createGetConnectionStatus(deps: {
  queries: ConnectionQueries;
  authorize: Authorize;
}) {
  return async function getConnectionStatus(args: {
    actor: Actor | null;
    otherUserId: string;
  }): Promise<ConnectionStatus> {
    const caller = deps.authorize(args.actor, PERMISSIONS.CONNECTION_MANAGE);
    return statusFor(
      await deps.queries.between(caller.userId, args.otherUserId),
      caller.userId
    );
  };
}

export type GetConnectionStatus = ReturnType<typeof createGetConnectionStatus>;
