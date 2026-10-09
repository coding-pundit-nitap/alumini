import { PERMISSIONS } from "@nitap/database/permissions";

import { ValidationError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import {
  decodeKeysetCursor,
  encodeKeysetCursor,
} from "../domain/keyset-cursor";
import { reportListQuerySchema, statusesFor } from "../domain/moderation";
import type { Authorize } from "./authz";
import type { ModerationStore, ReportView } from "./moderation-store";
import { parse } from "./validation";

/** The reports queue. Concealed from non-holders (404). */
export function createListReports(deps: {
  store: ModerationStore;
  authorize: Authorize;
}) {
  return async function listReports(args: {
    actor: Actor | null;
    query: unknown;
  }): Promise<{ data: ReportView[]; nextCursor: string | null }> {
    deps.authorize(args.actor, PERMISSIONS.REPORT_REVIEW, { concealed: true });
    const q = parse(reportListQuerySchema, args.query);
    const after = q.cursor ? decodeKeysetCursor(q.cursor) : null;
    if (q.cursor && !after)
      throw new ValidationError({ code: "INVALID_CURSOR" });

    const rows = await deps.store.transaction((tx) =>
      tx.listReports({
        statuses: statusesFor(q.status),
        targetType: q.targetType,
        after,
        take: q.limit + 1,
      })
    );
    const data = rows.slice(0, q.limit);
    const last = data.at(-1);
    return {
      data,
      nextCursor:
        rows.length > q.limit && last
          ? encodeKeysetCursor({ createdAt: last.createdAt, id: last.id })
          : null,
    };
  };
}
