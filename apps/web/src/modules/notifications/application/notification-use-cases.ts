import { PERMISSIONS } from "@nitap/database/permissions";
import { decideChannel, type NotificationDomain } from "@nitap/jobs";

import { NotFoundError } from "@/lib/errors";
import type { Actor, Permission } from "@/modules/auth";

import { decodeCursor } from "../domain/cursor";
import type { NotificationStore } from "./notification-store";

type Authorize = (actor: Actor | null, permission: Permission) => Actor;

/** Redis-backed unread counter. Never throws: `null`/no-op means "Redis unavailable, Postgres is truth" (N-9). */
export type UnreadCounter = {
  get(userId: string): Promise<number | null>;
  seed(userId: string, count: number): Promise<void>;
  decrement(userId: string, by: number): Promise<void>;
};

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;

export function createNotificationUseCases(deps: {
  store: NotificationStore;
  authorize: Authorize;
  counter: UnreadCounter;
  /** The preference domains: the Prisma enum, passed in from infrastructure (N-14). */
  domains: readonly NotificationDomain[];
}) {
  const { store, counter } = deps;
  // recipientId always comes from the session actor, never from the request.
  const own = (actor: Actor | null) =>
    deps.authorize(actor, PERMISSIONS.NOTIFICATION_READ).userId;

  return {
    async list(args: { actor: Actor | null; cursor?: string; limit?: number }) {
      const recipientId = own(args.actor);
      const limit = Math.min(
        Math.max(1, args.limit ?? DEFAULT_LIMIT),
        MAX_LIMIT
      );
      const { items, nextCursor } = await store.list({
        recipientId,
        cursor: args.cursor ? decodeCursor(args.cursor) : undefined,
        limit,
      });
      return {
        data: items,
        page: { limit, nextCursor, hasMore: nextCursor !== null },
      };
    },

    async markRead(args: { actor: Actor | null; id: string }) {
      const recipientId = own(args.actor);
      // Someone else's row and an unknown row are the same 404; an already-read row flips nothing.
      const flipped = await store.markRead({ recipientId, id: args.id });
      if (flipped) return counter.decrement(recipientId, 1);
      if (!(await store.exists({ recipientId, id: args.id }))) {
        throw new NotFoundError();
      }
    },

    async markAllRead(args: { actor: Actor | null }) {
      const recipientId = own(args.actor);
      const updated = await store.markAllRead(recipientId);
      if (updated > 0) await counter.decrement(recipientId, updated);
      return { updated };
    },

    async unreadCount(args: { actor: Actor | null }) {
      const recipientId = own(args.actor);
      const cached = await counter.get(recipientId);
      if (cached !== null) return cached;
      const count = await store.unreadCountFromDb(recipientId);
      await counter.seed(recipientId, count);
      return count;
    },

    async getPreferences(args: { actor: Actor | null }) {
      const rows = await deps.store.getPreferences(own(args.actor));
      return deps.domains.map((domain) => ({
        domain,
        email: decideChannel({
          category: "ENGAGEMENT",
          channel: "EMAIL",
          preferenceRow:
            rows.find((r) => r.domain === domain && r.channel === "EMAIL") ??
            null,
        }),
      }));
    },

    async setPreference(args: {
      actor: Actor | null;
      domain: NotificationDomain;
      enabled: boolean;
    }) {
      await store.setPreference({
        userId: own(args.actor),
        domain: args.domain,
        channel: "EMAIL",
        enabled: args.enabled,
      });
    },
  };
}
