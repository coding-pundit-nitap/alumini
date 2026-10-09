import { Prisma, type PrismaClient } from "@nitap/database";
import type { NotificationDomain } from "@nitap/jobs";

import type { EmailDeliveryUpdater } from "../processors/email-send.ts";
import type { DeliveryStore } from "./deliver.ts";

/**
 * Worker-side twin of apps/web's prisma-notification-store (worker cannot import from web). Also
 * implements `EmailDeliveryUpdater`: `deliver.ts` records exactly one EMAIL row per notification,
 * so `updateMany` keyed by notificationId + channel is safe — a missing row (payload predates this
 * feature, or the row was never written) is a no-op, not a throw.
 */
export function createPrismaDeliveryStore(
  prisma: PrismaClient
): DeliveryStore & EmailDeliveryUpdater {
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
    async emailDeliveryStatus(notificationId) {
      const row = await prisma.notificationDelivery.findUnique({
        where: {
          notificationId_channel: { notificationId, channel: "EMAIL" },
        },
        select: { status: true },
      });
      return row?.status ?? null;
    },
    async ensureEmailPending(notificationId) {
      await prisma.notificationDelivery.upsert({
        where: {
          notificationId_channel: { notificationId, channel: "EMAIL" },
        },
        create: { notificationId, channel: "EMAIL", status: "PENDING" },
        // Already exists (PENDING from an earlier attempt, or already SENT/FAILED): leave it alone,
        // never downgrade a terminal status back to PENDING.
        update: {},
      });
    },
    async bump(notificationId) {
      const [row] = await prisma.$queryRaw<{ wasRead: boolean }[]>`
        WITH old AS (
          SELECT id, read_at FROM notification WHERE id = ${notificationId}::uuid FOR UPDATE
        )
        UPDATE notification n SET created_at = now(), read_at = NULL
        FROM old WHERE n.id = old.id
        RETURNING old.read_at IS NOT NULL AS "wasRead"`;
      return { wasRead: row?.wasRead ?? false };
    },
    async markSent(notificationId, attempt) {
      await prisma.notificationDelivery.updateMany({
        where: { notificationId, channel: "EMAIL" },
        data: { status: "SENT", attempts: attempt },
      });
    },
    async markFailed(notificationId, attempt, reason) {
      await prisma.notificationDelivery.updateMany({
        where: { notificationId, channel: "EMAIL" },
        data: { status: "FAILED", attempts: attempt, lastError: reason },
      });
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
