import { Prisma, type PrismaClient } from "@nitap/database";

import { encodeCursor } from "../domain/cursor";
import type { NotificationStore } from "../application/notification-store";

export function createPrismaNotificationStore(
  prisma: PrismaClient
): NotificationStore {
  return {
    async insert(input) {
      try {
        const row = await prisma.notification.create({
          data: {
            recipientId: input.recipientId,
            type: input.type,
            category: input.category,
            payload: input.payload as Prisma.InputJsonValue,
            dedupeKey: input.dedupeKey,
          },
        });
        return { id: row.id, created: true };
      } catch (error) {
        // uq_notification_dedupe_key: the unique index is the backstop for concurrent inserts.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          const existing = await prisma.notification.findUniqueOrThrow({
            where: { dedupeKey: input.dedupeKey },
          });
          return { id: existing.id, created: false };
        }
        throw error;
      }
    },

    async failedEmailJobId(notificationId) {
      const row = await prisma.notificationDelivery.findUnique({
        where: { notificationId_channel: { notificationId, channel: "EMAIL" } },
        select: { status: true, notification: { select: { dedupeKey: true } } },
      });
      return row?.status === "FAILED" ? row.notification.dedupeKey : null;
    },

    async listEmailDeliveries({ status, after, updatedBefore, take }) {
      const rows = await prisma.notificationDelivery.findMany({
        where: {
          channel: "EMAIL",
          status,
          AND: [
            updatedBefore ? { updatedAt: { lt: updatedBefore } } : {},
            after
              ? {
                  OR: [
                    { updatedAt: { lt: after.updatedAt } },
                    { updatedAt: after.updatedAt, id: { lt: after.id } },
                  ],
                }
              : {},
          ],
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take,
        select: {
          id: true,
          notificationId: true,
          attempts: true,
          lastError: true,
          updatedAt: true,
          notification: {
            select: {
              type: true,
              recipient: { select: { id: true, email: true } },
            },
          },
        },
      });
      return rows.map((r) => ({
        id: r.id,
        notificationId: r.notificationId,
        type: r.notification.type,
        recipient: r.notification.recipient,
        attempts: r.attempts,
        lastError: r.lastError,
        updatedAt: r.updatedAt,
      }));
    },

    async recordDelivery(input) {
      await prisma.notificationDelivery.create({
        data: {
          notificationId: input.notificationId,
          channel: input.channel,
          status: input.status,
          attempts: 1,
          lastError: input.lastError,
          providerMessageId: input.providerMessageId,
        },
      });
    },

    async list({ recipientId, cursor, limit }) {
      const rows = await prisma.notification.findMany({
        where: {
          recipientId,
          ...(cursor
            ? {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
      });
      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const last = page.at(-1);
      return {
        items: page.map((row) => ({
          id: row.id,
          type: row.type,
          category: row.category,
          payload: row.payload as Record<string, unknown>,
          readAt: row.readAt,
          createdAt: row.createdAt,
        })),
        nextCursor:
          hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
      };
    },

    async markRead({ recipientId, id }) {
      const result = await prisma.notification.updateMany({
        where: { id, recipientId, readAt: null },
        data: { readAt: new Date() },
      });
      return result.count > 0;
    },

    async exists({ recipientId, id }) {
      return (
        (await prisma.notification.count({ where: { id, recipientId } })) > 0
      );
    },

    async markAllRead(recipientId) {
      const result = await prisma.notification.updateMany({
        where: { recipientId, readAt: null },
        data: { readAt: new Date() },
      });
      return result.count;
    },

    async unreadCountFromDb(recipientId) {
      return prisma.notification.count({
        where: { recipientId, readAt: null },
      });
    },

    async getPreferences(userId) {
      return prisma.notificationPreference.findMany({ where: { userId } });
    },

    async setPreference(input) {
      await prisma.notificationPreference.upsert({
        where: {
          userId_domain_channel: {
            userId: input.userId,
            domain: input.domain,
            channel: input.channel,
          },
        },
        create: input,
        update: { enabled: input.enabled },
      });
    },
  };
}
