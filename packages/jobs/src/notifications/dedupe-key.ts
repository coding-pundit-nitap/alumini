import { createHash } from "node:crypto";

/** One notification per (event, recipient, type); fan-out to N recipients yields N distinct keys. */
export function dedupeKeyFor(input: {
  eventId: string;
  recipientId: string;
  type: string;
}): string {
  return createHash("sha256")
    .update(`${input.type}:${input.eventId}:${input.recipientId}`)
    .digest("hex");
}

/**
 * One debounced message notification per (recipient, conversation, window) (spec N-6/N-7): every message in
 * the window maps to the same row. `windowBucket` names the window, e.g. the event id that opened it.
 */
export function messageDedupeKeyFor(input: {
  recipientId: string;
  conversationId: string;
  windowBucket: string;
}): string {
  return createHash("sha256")
    .update(
      `message.sent:window:${input.recipientId}:${input.conversationId}:${input.windowBucket}`
    )
    .digest("hex");
}
