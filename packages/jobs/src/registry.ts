import type { PayloadOf } from "./define-job.ts";
import { emailSend } from "./email.ts";
import { outboxPrune } from "./scheduled.ts";
import { uploadScan, uploadSweep } from "./upload.ts";

/** Jobs a use case can request by writing an outbox event. In 2B an event type maps 1:1 to a job. */
export const OUTBOX_EVENTS = {
  "email.send": emailSend,
  "upload.scan": uploadScan,
} as const;

/** Every job the worker knows, including scheduled ones that no outbox event produces. */
export const JOBS = {
  ...OUTBOX_EVENTS,
  "outbox.prune": outboxPrune,
  "upload.sweep": uploadSweep,
} as const;

export type OutboxEventType = keyof typeof OUTBOX_EVENTS;

/** A typed event a use case may write: the payload type follows the event type. */
export type OutboxEvent = {
  [K in OutboxEventType]: {
    type: K;
    payload: PayloadOf<(typeof OUTBOX_EVENTS)[K]>;
  };
}[OutboxEventType];

export function isOutboxEventType(value: string): value is OutboxEventType {
  return Object.hasOwn(OUTBOX_EVENTS, value);
}
