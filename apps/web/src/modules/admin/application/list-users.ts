import { PERMISSIONS } from "@nitap/database/permissions";

import { ValidationError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import {
  decodeKeysetCursor,
  encodeKeysetCursor,
} from "../domain/keyset-cursor";
import { userListQuerySchema } from "../domain/user-query";
import type { AdminStore, UserRow } from "./admin-store";
import type { Authorize } from "./authorize-port";
import { toValidationError } from "./validation";

/** FR-ADMIN-002, spec B12-10. Concealed from non-holders (404). */
export function createListUsers(deps: {
  store: AdminStore;
  authorize: Authorize;
}) {
  return async function listUsers(args: {
    actor: Actor | null;
    query: unknown;
  }): Promise<{ data: UserRow[]; nextCursor: string | null }> {
    deps.authorize(args.actor, PERMISSIONS.USER_READ_ADMIN, {
      concealed: true,
    });
    const parsed = userListQuerySchema.safeParse(args.query);
    if (!parsed.success) throw toValidationError(parsed.error);
    const { cursor, limit, ...filter } = parsed.data;
    const after = cursor ? decodeKeysetCursor(cursor) : null;
    if (cursor && !after) throw new ValidationError({ code: "INVALID_CURSOR" });

    const rows = await deps.store.listUsers({ filter, after, take: limit + 1 });
    const data = rows.slice(0, limit);
    const last = data.at(-1);
    return {
      data,
      nextCursor:
        rows.length > limit && last
          ? encodeKeysetCursor({ createdAt: last.createdAt, id: last.id })
          : null,
    };
  };
}
export type ListUsers = ReturnType<typeof createListUsers>;
