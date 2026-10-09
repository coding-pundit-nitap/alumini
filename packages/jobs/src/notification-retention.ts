import { z } from "zod";

import { defineJob } from "./define-job.ts";

export const notificationRetentionSweepPayload = z
  .object({ v: z.literal(1) })
  .strict();
export type NotificationRetentionSweepPayload = z.infer<
  typeof notificationRetentionSweepPayload
>;

/** Deletes READ notifications older than 90 days; unread ones are kept regardless of age. */
export const notificationRetentionSweep = defineJob({
  name: "notification.retention-sweep",
  version: 1,
  queue: "scheduled",
  schema: notificationRetentionSweepPayload,
  retry: { attempts: 3, baseDelayMs: 60_000, maxDelayMs: 600_000, jitter: 0.2 },
  timeoutMs: 120_000,
  idempotency:
    "Each batch deletes read notifications older than the retention window by a bounded, re-runnable query; running twice deletes nothing the second time.",
});
