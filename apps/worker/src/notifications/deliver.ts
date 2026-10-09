import {
  decideChannel,
  dedupeKeyFor,
  domainFor,
  renderNotificationCopy,
  type EmailSendPayload,
  type NotificationDomain,
} from "@nitap/jobs";
import { hashEmail } from "@nitap/email";
import { getMetrics } from "@nitap/observability";
import type { Logger, Metrics } from "@nitap/observability";

import type { NotificationHintPublisher } from "../hints.ts";
import type { UnreadCounter } from "./unread-counter.ts";

export type DeliverInput = {
  eventId: string;
  type: string;
  category: "TRANSACTIONAL" | "ENGAGEMENT";
  recipientId: string;
  payload: Record<string, unknown>;
  /** Omit to skip email regardless of preference. */
  emailTo?: string;
  /** Debounced notifications only: a duplicate bumps the existing row instead of being skipped. */
  dedupeKey?: string;
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
    channel: "IN_APP";
    status: "SENT";
  }): Promise<void>;
  /** Null when no EMAIL delivery row exists yet. */
  emailDeliveryStatus(
    notificationId: string
  ): Promise<"PENDING" | "SENT" | "FAILED" | null>;
  /** Upserts a PENDING EMAIL row without downgrading a SENT or FAILED one. */
  ensureEmailPending(notificationId: string): Promise<void>;
  /** Moves a debounced row to now and unread; reports whether it had been read. */
  bump(notificationId: string): Promise<{ wasRead: boolean }>;
};

/**
 * In-app row first, then email if category, channel and preference allow. Idempotent on the dedupe key.
 * The EMAIL row is written PENDING before enqueueing, so the job can never mark it SENT before it exists.
 */
export function createDeliverNotification(deps: {
  store: DeliveryStore;
  getPreference: (
    userId: string,
    domain: NotificationDomain,
    channel: "EMAIL"
  ) => Promise<{ enabled: boolean } | null>;
  /** `jobId` is the dedupe key, so a redelivered event cannot enqueue a second email. */
  enqueueEmail: (
    payload: EmailSendPayload,
    options: { jobId: string }
  ) => Promise<void>;
  /** Omitted means nothing is suppressed. */
  isSuppressed?: (emailHash: string) => Promise<boolean>;
  hintPublisher: NotificationHintPublisher | null;
  unreadCounter: UnreadCounter;
  logger: Logger;
  /** Public web origin, the base of the email's action link. */
  appUrl: string;
  metrics?: Metrics;
}): DeliverNotification {
  const metrics = deps.metrics ?? getMetrics();
  return async (input) => {
    const dedupeKey = input.dedupeKey ?? dedupeKeyFor(input);
    // The counter is a cache and the hint a refetch nudge, so a Redis outage degrades only real-time push.
    const announce = async (id: string) => {
      try {
        await deps.unreadCounter.increment(input.recipientId);
        await deps.hintPublisher?.publish(input.recipientId, {
          notificationId: id,
        });
      } catch (error) {
        deps.logger.warn("notification.realtime_unavailable", {
          metadata: { message: (error as Error).message },
        });
      }
    };
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
      // A later message in the same window bumps the one row; count it again only if it had been read.
      if (input.dedupeKey && (await deps.store.bump(id)).wasRead)
        await announce(id);
      const emailStatus = await deps.store.emailDeliveryStatus(id);
      if (emailStatus === "SENT" || emailStatus === "FAILED") return;
      // PENDING or null: the enqueue may not have happened, so retry it below (both steps are idempotent).
    } else {
      // Known gap: a crash between the insert and this record makes the retry see a duplicate and skip the
      // unread bump and hint. The row is still visible and the counter is recomputed from PostgreSQL.
      await deps.store.recordDelivery({
        notificationId: id,
        channel: "IN_APP",
        status: "SENT",
      });
      metrics.increment("notification_delivered_total", {
        channel: "IN_APP",
        category: input.category,
      });
      await announce(id);
    }

    if (!input.emailTo) return;
    // decideChannel ignores the row for TRANSACTIONAL, so do not look it up.
    const preference =
      input.category === "TRANSACTIONAL"
        ? null
        : await deps.getPreference(
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

    // A bounced or complained address gets in-app only.
    if (await deps.isSuppressed?.(hashEmail(input.emailTo))) {
      deps.logger.info("notification.email_suppressed", {
        metadata: { type: input.type },
      });
      return;
    }

    const copy = renderNotificationCopy(input.type, input.payload);
    await deps.store.ensureEmailPending(id);
    await deps.enqueueEmail(
      {
        v: 1,
        to: input.emailTo,
        template: "notification",
        notificationId: id,
        category: input.category,
        params: {
          title: copy.title,
          body: copy.body,
          actionUrl: `${deps.appUrl}${copy.actionPath}`,
        },
      },
      { jobId: dedupeKey }
    );
  };
}
