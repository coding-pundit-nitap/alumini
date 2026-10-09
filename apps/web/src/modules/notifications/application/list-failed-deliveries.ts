import { PERMISSIONS } from "@nitap/database/permissions";

import type { Actor, Permission, Resource } from "@/modules/auth";

import { decodeCursor, encodeCursor } from "../domain/cursor";
import type { EmailDeliveryRow, NotificationStore } from "./notification-store";

type Authorize = (
  actor: Actor | null,
  permission: Permission,
  resource?: Resource
) => Actor;

export const FAILED_PAGE_SIZE = 50;
export const STUCK_AFTER_MS = 60 * 60 * 1000;
export const LAST_ERROR_MAX = 200;

const clip = (row: EmailDeliveryRow): EmailDeliveryRow => ({
  ...row,
  lastError:
    row.lastError === null ? null : row.lastError.slice(0, LAST_ERROR_MAX),
});

/** FAILED deliveries (replayable) and PENDING ones idle for over an hour (read-only). */
export function createListFailedDeliveries(deps: {
  store: Pick<NotificationStore, "listEmailDeliveries">;
  authorize: Authorize;
  now: () => Date;
}) {
  return async function listFailedDeliveries(args: {
    actor: Actor | null;
    cursor?: string;
  }) {
    deps.authorize(args.actor, PERMISSIONS.NOTIFICATION_REPLAY, {
      concealed: true,
    });
    const c = args.cursor ? decodeCursor(args.cursor) : undefined;
    const [failed, stuck] = await Promise.all([
      deps.store.listEmailDeliveries({
        status: "FAILED",
        after: c && { updatedAt: c.createdAt, id: c.id },
        take: FAILED_PAGE_SIZE + 1,
      }),
      deps.store.listEmailDeliveries({
        status: "PENDING",
        updatedBefore: new Date(deps.now().getTime() - STUCK_AFTER_MS),
        take: FAILED_PAGE_SIZE,
      }),
    ]);
    const data = failed.slice(0, FAILED_PAGE_SIZE).map(clip);
    const last = data.at(-1);
    return {
      failed: data,
      nextCursor:
        failed.length > FAILED_PAGE_SIZE && last
          ? encodeCursor(last.updatedAt, last.id)
          : null,
      stuck: stuck.map(clip),
    };
  };
}
