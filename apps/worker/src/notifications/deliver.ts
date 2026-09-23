import {
  decideChannel,
  dedupeKeyFor,
  domainFor,
  renderNotificationCopy,
  type EmailSendPayload,
  type NotificationDomain,
} from "@nitap/jobs";
import type { Logger } from "@nitap/observability";

import type { NotificationHintPublisher } from "../hints.ts";
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
  /** Whether a delivery row already exists for the channel (a retry must not repeat a finished step). */
  hasDelivery(input: {
    notificationId: string;
    channel: "IN_APP" | "EMAIL";
  }): Promise<boolean>;
};

/**
 * The single fan-out-to-one-recipient primitive every event processor calls (spec N-5). Writes the
 * in-app row first (durable even if email later fails), then enqueues email only if the category,
 * channel and stored preference allow it. Idempotent: a duplicate dedupeKey short-circuits before
 * a second in-app row or unread bump, and the email step is skipped once an EMAIL delivery is recorded.
 * A retry after a crash between the in-app write and the email enqueue still queues the email; the
 * dedupe key is its job id, so a job that was in fact queued is not queued twice.
 */
export function createDeliverNotification(deps: {
  store: DeliveryStore;
  getPreference: (
    userId: string,
    domain: NotificationDomain,
    channel: "EMAIL"
  ) => Promise<{ enabled: boolean } | null>;
  /** `jobId` is the notification dedupe key so a redelivered event cannot enqueue a second email. */
  enqueueEmail: (
    payload: EmailSendPayload,
    options: { jobId: string }
  ) => Promise<void>;
  hintPublisher: NotificationHintPublisher | null;
  unreadCounter: UnreadCounter;
  logger: Logger;
  /** Public web origin, the base of the email's action link. */
  appUrl: string;
}): DeliverNotification {
  return async (input) => {
    const dedupeKey = dedupeKeyFor(input);
    const { id, created } = await deps.store.insert({
      recipientId: input.recipientId,
      type: input.type,
      category: input.category,
      payload: input.payload,
      dedupeKey,
    });
    if (!created) {
      deps.logger.info("notification.deduped", {
        metadata: { type: input.type },
      });
      if (
        await deps.store.hasDelivery({ notificationId: id, channel: "EMAIL" })
      )
        return;
    } else {
      // Known residual gap: a crash between the insert above and this IN_APP record means the retry sees a
      // duplicate and skips these steps, so the unread bump and hint are lost. The in-app row is still
      // visible, and the unread counter is a cache recomputed from PostgreSQL (N-9), so it self-heals.
      await deps.store.recordDelivery({
        notificationId: id,
        channel: "IN_APP",
        status: "SENT",
      });
      await deps.unreadCounter.increment(input.recipientId);
      await deps.hintPublisher?.publish(input.recipientId, {
        notificationId: id,
      });
    }

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
    await deps.enqueueEmail(
      {
        v: 1,
        to: input.emailTo,
        template: "notification",
        notificationId: id,
        params: {
          title: copy.title,
          body: copy.body,
          actionUrl: `${deps.appUrl}${copy.actionPath}`,
        },
      },
      { jobId: dedupeKey }
    );
    await deps.store.recordDelivery({
      notificationId: id,
      channel: "EMAIL",
      status: "PENDING",
    });
  };
}
