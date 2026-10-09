import type { Actor } from "../domain/actor";
import { PERMISSIONS } from "../domain/permission";
import type { Authorization } from "./authorize";
import { decodeCursor, encodeCursor } from "./cursor";
import type {
  PendingVerification,
  VerificationStore,
} from "./verification-store";

export const PENDING_PAGE_SIZE = 25;

export type PendingPage = {
  items: PendingVerification[];
  nextCursor: string | null;
};

/**
 * Pending requests, oldest first. 404 without `alumni.verify`, so the queue
 * isn't revealed.
 */
export function createListPendingVerificationRequests(deps: {
  store: VerificationStore;
  authorize: Authorization["authorize"];
}) {
  return async function listPendingVerificationRequests(args: {
    actor: Actor | null;
    cursor?: string | null;
  }): Promise<PendingPage> {
    deps.authorize(args.actor, PERMISSIONS.ALUMNI_VERIFY, { concealed: true });
    const after = args.cursor ? decodeCursor(args.cursor) : null;

    const rows = await deps.store.listPending({
      after,
      limit: PENDING_PAGE_SIZE + 1,
    });
    const items = rows.slice(0, PENDING_PAGE_SIZE);
    const last = items[items.length - 1];
    return {
      items,
      nextCursor:
        rows.length > PENDING_PAGE_SIZE && last
          ? encodeCursor({ createdAt: last.submittedAt, id: last.id })
          : null,
    };
  };
}
