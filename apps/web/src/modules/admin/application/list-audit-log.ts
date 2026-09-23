import { PERMISSIONS, type Permission } from "@nitap/database/permissions";

import { ValidationError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import {
  auditQuerySchema,
  decodeAuditCursor,
  encodeAuditCursor,
} from "../domain/audit-query";
import type { AdminStore, AuditRow } from "./admin-store";

export type Authorize = (
  actor: Actor | null,
  permission: Permission,
  resource?: { concealed?: boolean }
) => Actor;

/** FR-ADMIN-004, spec A12-7/A12-8. The audit log's existence is concealed from non-holders (404). */
export function createListAuditLog(deps: {
  store: AdminStore;
  authorize: Authorize;
}) {
  return async function listAuditLog(args: {
    actor: Actor | null;
    query: unknown;
  }): Promise<{ data: AuditRow[]; nextCursor: string | null }> {
    deps.authorize(args.actor, PERMISSIONS.AUDIT_READ, { concealed: true });

    const parsed = auditQuerySchema.safeParse(args.query);
    if (!parsed.success) {
      throw new ValidationError({
        details: parsed.error.issues.map((issue) => ({
          field: issue.path.join(".") || "(query)",
          code: "INVALID",
          message: issue.message,
        })),
      });
    }
    const { cursor, limit, ...filter } = parsed.data;
    const after = cursor ? decodeAuditCursor(cursor) : null;
    if (cursor && !after) throw new ValidationError({ code: "INVALID_CURSOR" });

    const rows = await deps.store.listAuditLog({
      filter,
      after,
      take: limit + 1,
    });
    const data = rows.slice(0, limit);
    const last = data.at(-1);
    return {
      data,
      nextCursor:
        rows.length > limit && last
          ? encodeAuditCursor({ createdAt: last.createdAt, id: last.id })
          : null,
    };
  };
}
export type ListAuditLog = ReturnType<typeof createListAuditLog>;
