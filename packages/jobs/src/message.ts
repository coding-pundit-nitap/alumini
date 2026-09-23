import { z } from "zod";

import { defineJob } from "./define-job.ts";

/** Ids only: the worker looks the recipients up, so the event never carries a body or a name (reliability §6.4). */
const messageSentPayload = z
  .object({
    v: z.literal(1),
    messageId: z.uuid(),
    conversationId: z.uuid(),
    senderId: z.uuid(),
  })
  .strict();
export type MessageSentPayload = z.infer<typeof messageSentPayload>;

/**
 * A message was committed. The worker turns it into a Redis pub/sub hint for each recipient; delivery never
 * blocks the send (FR-MSG-005). A hint published twice only makes the client refetch once more.
 */
export const messageSent = defineJob({
  name: "message.sent",
  version: 1,
  queue: "default",
  schema: messageSentPayload,
  retry: { attempts: 8, baseDelayMs: 1_000, maxDelayMs: 60_000, jitter: 0.2 },
  timeoutMs: 10_000,
  idempotency:
    "Publishing the same hint twice only makes the client refetch; running twice has the same effect as once.",
});

export const MESSAGE_HINT_PREFIX = "msg:user:";
/** The Redis pub/sub channel one member's browser tabs listen on (spec M-3). */
export const messageHintChannel = (userId: string) =>
  `${MESSAGE_HINT_PREFIX}${userId}`;
/** What travels on the channel: ids only. The client refetches through the authorized API. */
export type MessageHint = { conversationId: string; messageId: string };

export const NOTIFICATION_HINT_PREFIX = "notif:user:";
/** The Redis pub/sub channel for notification hints (spec N-8), alongside the message channel. */
export const notificationHintChannel = (userId: string) =>
  `${NOTIFICATION_HINT_PREFIX}${userId}`;
/** Ids only: a refetch hint, never the notification content. */
export type NotificationHint = { notificationId: string };
