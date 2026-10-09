import { z } from "zod";

import { defineJob, FANOUT_TIMEOUT_MS } from "./define-job.ts";

const retry = {
  attempts: 8,
  baseDelayMs: 1_000,
  maxDelayMs: 60_000,
  jitter: 0.2,
};

const announcementPublishedPayload = z
  .object({ v: z.literal(1), postId: z.uuid(), authorId: z.uuid() })
  .strict();
export type AnnouncementPublishedPayload = z.infer<
  typeof announcementPublishedPayload
>;

/** Fanned out to every verified member (in-app + email, preference-gated). */
export const announcementPublished = defineJob({
  name: "announcement.published",
  version: 1,
  queue: "default",
  schema: announcementPublishedPayload,
  retry,
  timeoutMs: FANOUT_TIMEOUT_MS,
  idempotency:
    "deliver() keys each notification by (type, job id, recipient): a retried or replayed fan-out re-walks the recipients and skips everyone already notified.",
});
