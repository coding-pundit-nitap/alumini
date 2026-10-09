import type { Prisma } from "../generated/prisma/client.ts";
import { RETENTION_CATALOGUE } from "../prisma/seed-data/retention.ts";

export type NotificationRetentionClient = Pick<
  Prisma.TransactionClient,
  "notification"
>;
export type RetentionSettingClient = Pick<
  Prisma.TransactionClient,
  "retentionSetting"
>;

export type NotificationRetentionStore = {
  /** The configured period; the default placeholder when the row is missing. */
  retentionDays(db: RetentionSettingClient): Promise<number>;
  /**
   * Deletes up to `limit` READ notifications read before `before`; unread are
   * never swept.
   */
  sweep(
    db: NotificationRetentionClient,
    before: Date,
    limit: number
  ): Promise<number>;
};

export function createNotificationRetentionStore(): NotificationRetentionStore {
  return {
    async retentionDays(db) {
      const row = await db.retentionSetting.findUnique({
        where: { category: "notifications" },
        select: { retentionDays: true },
      });
      return (
        row?.retentionDays ?? RETENTION_CATALOGUE.notifications.defaultDays
      );
    },

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
