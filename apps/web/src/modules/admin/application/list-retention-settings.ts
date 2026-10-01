import { PERMISSIONS } from "@nitap/database/permissions";

import type { Actor } from "@/modules/auth";

import type {
  RetentionCatalogue,
  RetentionSettingView,
} from "../domain/retention";
import type { SettingsStore } from "./admin-store";
import type { Authorize } from "./authorize-port";

/**
 * 12G G-3. Rows in catalogue order, each with its bounds and whether a sweep enforces it; a category the
 * catalogue no longer knows is left out. Concealed from non-holders (404), like the audit log.
 */
export function createListRetentionSettings(deps: {
  store: SettingsStore;
  authorize: Authorize;
  catalogue: RetentionCatalogue;
}) {
  return async function listRetentionSettings(args: {
    actor: Actor | null;
  }): Promise<RetentionSettingView[]> {
    deps.authorize(args.actor, PERMISSIONS.SYSTEM_CONFIGURE, {
      concealed: true,
    });
    const rows = new Map(
      (await deps.store.listRetention()).map((r) => [r.category, r])
    );
    return Object.entries(deps.catalogue).flatMap(([category, rule]) => {
      const row = rows.get(category);
      return row ? [{ ...rule, ...row }] : [];
    });
  };
}
export type ListRetentionSettings = ReturnType<
  typeof createListRetentionSettings
>;
