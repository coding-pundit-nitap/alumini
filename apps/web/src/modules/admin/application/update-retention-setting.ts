import { PERMISSIONS } from "@nitap/database/permissions";

import { NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import {
  retentionInputSchema,
  type RetentionCatalogue,
  type RetentionInput,
} from "../domain/retention";
import type { SettingsStore } from "./admin-store";
import type { Authorize } from "./authorize-port";
import { toValidationError } from "./validation";

/** An unchanged submit writes and audits nothing. */
export function createUpdateRetentionSetting(deps: {
  store: SettingsStore;
  authorize: Authorize;
  catalogue: RetentionCatalogue;
}) {
  return async function updateRetentionSetting(args: {
    actor: Actor | null;
    category: string;
    input: unknown;
  }): Promise<RetentionInput & { changed: boolean }> {
    const actor = deps.authorize(args.actor, PERMISSIONS.SYSTEM_CONFIGURE, {
      concealed: true,
    });
    const rule = Object.hasOwn(deps.catalogue, args.category)
      ? deps.catalogue[args.category]
      : undefined;
    if (!rule) throw new NotFoundError();

    const parsed = retentionInputSchema(rule).safeParse(args.input);
    if (!parsed.success) throw toValidationError(parsed.error);
    const to = parsed.data;

    return deps.store.transaction(async (tx) => {
      const row = await tx.findForUpdate(args.category);
      if (!row) throw new NotFoundError();
      if (
        row.retentionDays === to.retentionDays &&
        row.approvedBy === to.approvedBy
      )
        return { ...to, changed: false };

      await tx.update(row.id, to, actor.userId);
      await tx.audit({
        actorId: actor.userId,
        targetId: row.id,
        metadata: {
          key: args.category,
          from: {
            retentionDays: row.retentionDays,
            approved: row.approvedBy !== null,
          },
          to: {
            retentionDays: to.retentionDays,
            approved: to.approvedBy !== null,
          },
        },
      });
      return { ...to, changed: true };
    });
  };
}
export type UpdateRetentionSetting = ReturnType<
  typeof createUpdateRetentionSetting
>;
