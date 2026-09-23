-- AlterTable: one NotificationDelivery row per (notificationId, channel) so a PENDING row can be
-- upserted idempotently instead of inserted a second time on a redelivery/retry.
CREATE UNIQUE INDEX "ux_notification_delivery_notification_channel" ON "notification_delivery"("notification_id", "channel");
