import { Prisma, type PrismaClient } from "@nitap/database";
import type { NotificationDomain } from "@nitap/jobs";

import type { DeliveryStore } from "./deliver.ts";

/** Worker-side twin of apps/web's prisma-notification-store (worker cannot import from web). */
export function createPrismaDeliveryStore(prisma: PrismaClient): DeliveryStore {
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
    async recordDelivery(input) {
      await prisma.notificationDelivery.create({
        data: { ...input, attempts: 1 },
      });
    },
    async hasDelivery(input) {
      return (await prisma.notificationDelivery.count({ where: input })) > 0;
    },
  };
}

export const getPreference =
  (prisma: PrismaClient) =>
  (userId: string, domain: NotificationDomain, channel: "EMAIL") =>
    prisma.notificationPreference.findUnique({
      where: { userId_domain_channel: { userId, domain, channel } },
      select: { enabled: true },
    });
