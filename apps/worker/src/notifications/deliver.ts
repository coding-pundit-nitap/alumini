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
    channel: "IN_APP";
    status: "SENT";
  }): Promise<void>;
  /** The EMAIL delivery row's current status, or null if none has been recorded yet. */
  emailDeliveryStatus(
    notificationId: string
  ): Promise<"PENDING" | "SENT" | "FAILED" | null>;
  /**
   * Idempotently ensures a PENDING EMAIL delivery row exists (an upsert that never downgrades an
   * already-SENT/FAILED row): called before `enqueueEmail`, so a retry that already wrote it does not
   * fail or duplicate the row.
   */
  ensureEmailPending(notificationId: string): Promise<void>;
};

/**
 * The single fan-out-to-one-recipient primitive every event processor calls (spec N-5). Writes the
 * in-app row first (durable even if email later fails), then enqueues email only if the category,
 * channel and stored preference allow it. Idempotent: a duplicate dedupeKey short-circuits before a
 * second in-app row or unread bump, and the email step is skipped once the EMAIL delivery has reached a
 * terminal status (SENT/FAILED).
 *
 * The EMAIL delivery row is recorded PENDING *before* `enqueueEmail` runs, not after:
 * recording it after would leave a window where the enqueued job runs and marks the row SENT before the
 * PENDING insert even lands, after which that insert would either fail (unique row already exists — see
 * `ensureEmailPending`) or silently strand the row PENDING forever. Because the write now happens first,
 * a retry after a crash/throw anywhere from just before that write onward sees the row already PENDING
 * (not SENT/FAILED) and safely repeats both the (idempotent) write and the enqueue; `enqueueEmail`'s job
 * id is the notification's dedupe key, so BullMQ absorbs a duplicate enqueue without sending twice.
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
      const emailStatus = await deps.store.emailDeliveryStatus(id);
      if (emailStatus === "SENT" || emailStatus === "FAILED") return;
      // PENDING or null: the enqueue may never have happened (or happened but the outcome hasn't
      // landed yet); fall through and (re)try it below — both the PENDING write and the enqueue are
      // idempotent, so this is safe even if the first attempt actually did queue the job.
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
    await deps.store.ensureEmailPending(id);
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
  };
}
