import { z } from "zod";

import { defineJob } from "./define-job.ts";

const httpUrl = z.url({ protocol: /^https?$/ });
const common = { v: z.literal(1), to: z.email() };

/**
 * The parameters carry a link that contains a token (a secret). Never log `to` or `params`
 * (reliability §6.4); the templates that use them live in @nitap/email.
 */
export const emailSendPayload = z.discriminatedUnion("template", [
  z
    .object({
      ...common,
      template: z.literal("verify-email"),
      params: z
        .object({
          verificationUrl: httpUrl,
          expiresInMinutes: z.number().int().positive(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...common,
      template: z.literal("reset-password"),
      params: z
        .object({
          resetUrl: httpUrl,
          expiresInMinutes: z.number().int().positive(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...common,
      template: z.literal("existing-account"),
      params: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      ...common,
      template: z.literal("verification-approved"),
      params: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      ...common,
      template: z.literal("verification-rejected"),
      params: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      ...common,
      template: z.literal("notification"),
      /** Ids-only link back to the NotificationDelivery row this send updates (N-12). */
      notificationId: z.uuid().optional(),
      params: z
        .object({
          title: z.string().min(1),
          body: z.string().min(1),
          actionUrl: httpUrl,
        })
        .strict(),
    })
    .strict(),
]);

export type EmailSendPayload = z.infer<typeof emailSendPayload>;

/**
 * 13 attempts with exponential backoff from 30 s capped at 60 min is about six hours of retrying
 * (SRS NFR-REL-003, ADR-007): long enough to ride out a provider outage.
 */
export const emailSend = defineJob({
  name: "email.send",
  version: 1,
  queue: "email",
  schema: emailSendPayload,
  retry: {
    attempts: 13,
    baseDelayMs: 30_000,
    maxDelayMs: 3_600_000,
    jitter: 0.2,
  },
  timeoutMs: 30_000,
  idempotency:
    "The event id (the job id) dedupes queueing. SMTP has no idempotency key, so a crash between 'sent' and 'acknowledged' can send one duplicate; acceptable for these templates.",
});
