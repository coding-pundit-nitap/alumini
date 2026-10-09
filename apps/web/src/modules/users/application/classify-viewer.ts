import { PERMISSIONS } from "@nitap/database/permissions";

import type { Actor } from "@/modules/auth";

import type { Viewer } from "../domain/visibility";
import type { Can } from "./authz";
import type { ConnectionLookup, Relation } from "./connection-lookup";

/**
 * A failed connection lookup fails closed: the viewer is treated as a plain
 * member.
 */
export function classifyViewer(deps: {
  connections: ConnectionLookup;
  can: Can;
  reportError?: (error: unknown) => void;
}) {
  async function relationTo(
    viewerId: string,
    ownerId: string
  ): Promise<Relation> {
    try {
      return await deps.connections.relation(viewerId, ownerId);
    } catch (error) {
      deps.reportError?.(error);
      return "none";
    }
  }

  return async function classify(
    actor: Actor | null,
    ownerId: string
  ): Promise<Viewer> {
    if (!actor) return "guest";
    if (actor.userId === ownerId) return "owner";
    if (actor.accountState !== "VERIFIED") return "unverified";
    if (deps.can(actor, PERMISSIONS.PROFILE_READ_ANY)) return "privileged";
    const relation = await relationTo(actor.userId, ownerId);
    if (relation === "blocked") return "blocked";
    if (!deps.can(actor, PERMISSIONS.PROFILE_READ)) return "unverified";
    return relation === "connected" ? "connected" : "member";
  };
}
