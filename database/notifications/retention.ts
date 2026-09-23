import type { Prisma } from "../generated/prisma/client.ts";

export type NotificationRetentionClient = Pick<
  Prisma.TransactionClient,
  "notification"
>;

export type NotificationRetentionStore = {
  /** Deletes up to `limit` READ notifications read before `before`; unread are never swept (spec N-15). */
  sweep(
    db: NotificationRetentionClient,
    before: Date,
    limit: number
  ): Promise<number>;
};

export function createNotificationRetentionStore(): NotificationRetentionStore {
  return {
    async sweep(db, before, limit) {
      const stale = await db.notification.findMany({
        where: { readAt: { not: null, lt: before } },
        select: { id: true },
        orderBy: { readAt: "asc" },
        take: limit,
      });
      if (stale.length === 0) return 0;
      // NotificationDelivery rows go with them (onDelete: Cascade).
      const { count } = await db.notification.deleteMany({
        where: { id: { in: stale.map((row) => row.id) } },
      });
      return count;
    },
  };
}
