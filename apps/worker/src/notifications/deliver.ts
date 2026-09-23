import {
  decideChannel,
  dedupeKeyFor,
  domainFor,
  renderNotificationCopy,
  type EmailSendPayload,
  type NotificationDomain,
} from "@nitap/jobs";
import type { Logger } from "@nitap/observability";

import type { HintPublisher } from "../hints.ts";
import type { UnreadCounter } from "./unread-counter.ts";

export type DeliverInput = {
  eventId: string;
  type: string;
  category: "TRANSACTIONAL" | "ENGAGEMENT";
  recipientId: string;
  payload: Record<string, unknown>;
  /** The recipient's current email, re-read by the caller. Omit to skip email regardless of preference. */
  emailTo?: string;
};

export type DeliverNotification = (input: DeliverInput) => Promise<void>;

/** The slice of the notification store the worker needs. */
export type DeliveryStore = {
  insert(input: {
    recipientId: string;
    type: string;
    category: "TRANSACTIONAL" | "ENGAGEMENT";
    payload: Record<string, unknown>;
    dedupeKey: string;
  }): Promise<{ id: string; created: boolean }>;
  recordDelivery(input: {
    notificationId: string;
    channel: "IN_APP" | "EMAIL";
    status: "PENDING" | "SENT" | "FAILED";
  }): Promise<void>;
};

/**
 * The single fan-out-to-one-recipient primitive every event processor calls (spec N-5). Writes the
 * in-app row first (durable even if email later fails), then enqueues email only if the category,
 * channel and stored preference allow it. Idempotent: a duplicate dedupeKey short-circuits before
 * any email enqueue, so a redelivered outbox event never double-sends.
 */
export function createDeliverNotification(deps: {
  store: DeliveryStore;
  getPreference: (
    userId: string,
    domain: NotificationDomain,
    channel: "EMAIL"
  ) => Promise<{ enabled: boolean } | null>;
  enqueueEmail: (payload: EmailSendPayload) => Promise<void>;
  hintPublisher: HintPublisher | null;
  unreadCounter: UnreadCounter;
  logger: Logger;
}): DeliverNotification {
  return async (input) => {
    const { id, created } = await deps.store.insert({
      recipientId: input.recipientId,
      type: input.type,
      category: input.category,
      payload: input.payload,
      dedupeKey: dedupeKeyFor(input),
    });
    if (!created) {
      deps.logger.info("notification.deduped", {
        metadata: { type: input.type },
      });
      return;
    }
    await deps.store.recordDelivery({
      notificationId: id,
      channel: "IN_APP",
      status: "SENT",
    });
    await deps.unreadCounter.increment(input.recipientId);
    await deps.hintPublisher?.publish(input.recipientId, {
      notificationId: id,
    } as never);

    if (!input.emailTo) return;
    const preference = await deps.getPreference(
      input.recipientId,
      domainFor(input.type),
      "EMAIL"
    );
    if (
      !decideChannel({
        category: input.category,
        channel: "EMAIL",
        preferenceRow: preference,
      })
    )
      return;

    const copy = renderNotificationCopy(input.type, input.payload);
    await deps.enqueueEmail({
      v: 1,
      to: input.emailTo,
      template: "notification",
      params: {
        title: copy.title,
        body: copy.body,
        actionUrl: `${process.env.APP_URL ?? ""}${copy.actionPath}`,
      },
    });
    await deps.store.recordDelivery({
      notificationId: id,
      channel: "EMAIL",
      status: "PENDING",
    });
  };
}
