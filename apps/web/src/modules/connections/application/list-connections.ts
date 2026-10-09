import { PERMISSIONS } from "@nitap/database/permissions";

import type { Actor } from "@/modules/auth";

import { decodeCursor, encodeCursor } from "../domain/cursor";
import type { Authorize } from "./authz";
import type {
  ConnectionQueries,
  ListedConnection,
  ListFilter,
} from "./connection-store";

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;

export type ConnectionPage = {
  data: ListedConnection[];
  page: { limit: number; nextCursor: string | null; hasMore: boolean };
};

/**
 * The caller's own connections, incoming or outgoing requests, and their own
 * blocks.
 */
export function createListConnections(deps: {
  queries: ConnectionQueries;
  authorize: Authorize;
}) {
  return async function listConnections(args: {
    actor: Actor | null;
    state?: ListFilter["state"];
    direction?: ListFilter["direction"];
    limit?: number;
    cursor?: string;
  }): Promise<ConnectionPage> {
    const caller = deps.authorize(args.actor, PERMISSIONS.CONNECTION_MANAGE);
    const limit = Math.min(Math.max(1, args.limit ?? DEFAULT_LIMIT), MAX_LIMIT);

    const rows = await deps.queries.list(caller.userId, {
      state: args.state ?? "ACCEPTED",
      direction: args.direction,
      limit: limit + 1,
      after: args.cursor ? decodeCursor(args.cursor) : undefined,
    });

    const more = rows.length > limit;
    const data = more ? rows.slice(0, limit) : rows;
    const last = data.at(-1);
    return {
      data,
      page: {
        limit,
        nextCursor:
          more && last
            ? encodeCursor({ requestedAt: last.requestedAt, id: last.id })
            : null,
        hasMore: more,
      },
    };
  };
}

export type ListConnections = ReturnType<typeof createListConnections>;
