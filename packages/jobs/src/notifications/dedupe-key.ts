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

/** Every message in the window maps to the same notification row. */
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
