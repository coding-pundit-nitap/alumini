import type { Permission } from "@nitap/database/permissions";

import { AuthenticationError, NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { dashboardTiles, hasAdminAccess, type TileKey } from "../domain/access";
import type { AdminStore, TileCount } from "./admin-store";

export type DashboardTile =
  | { key: TileKey; status: "ok"; value: TileCount }
  | { key: TileKey; status: "unavailable" };

/**
 * Counts only the tiles the actor may act on, and each tile fails on its own:
 * one slow or broken table renders "Unavailable" instead of taking the dashboard down.
 */
export function createGetDashboard(deps: {
  store: AdminStore;
  can: (actor: Actor, permission: Permission) => boolean;
  now?: () => Date;
  onTileFailed?: (key: TileKey, error: unknown) => void;
}) {
  const now = deps.now ?? (() => new Date());
  return async function getDashboard(args: {
    actor: Actor | null;
  }): Promise<DashboardTile[]> {
    const { actor } = args;
    if (!actor) throw new AuthenticationError();
    const can = (permission: Permission) => deps.can(actor, permission);
    // Not 403: the admin area's existence is not advertised.
    if (!hasAdminAccess(can)) throw new NotFoundError();

    const keys = dashboardTiles(can);
    const at = now();
    const settled = await Promise.allSettled(
      keys.map((key) => deps.store.countTile(key, at))
    );
    return keys.map((key, i): DashboardTile => {
      const result = settled[i]!;
      if (result.status === "fulfilled")
        return { key, status: "ok", value: result.value };
      deps.onTileFailed?.(key, result.reason);
      return { key, status: "unavailable" };
    });
  };
}
export type GetDashboard = ReturnType<typeof createGetDashboard>;
