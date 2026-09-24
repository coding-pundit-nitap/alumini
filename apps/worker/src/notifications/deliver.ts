import {
  decideChannel,
  dedupeKeyFor,
  domainFor,
  renderNotificationCopy,
  type EmailSendPayload,
  type NotificationDomain,
} from "@nitap/jobs";
import { hashEmail } from "@nitap/email";
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
  /**
   * Set only by debounced notifications (message.sent, N-6/N-7): the window's key instead of the per-event one.
   * A duplicate then bumps the existing row (newest, unread) rather than being skipped.
   */
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
  /** Moves a debounced row to now and unread; reports whether it had been read. */
  bump(notificationId: string): Promise<{ wasRead: boolean }>;
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
  /** `EmailPort.isSuppressed` (N-10); omitted means nothing is suppressed. */
  isSuppressed?: (emailHash: string) => Promise<boolean>;
  hintPublisher: NotificationHintPublisher | null;
  unreadCounter: UnreadCounter;
  logger: Logger;
  /** Public web origin, the base of the email's action link. */
  appUrl: string;
}): DeliverNotification {
  return async (input) => {
    const dedupeKey = input.dedupeKey ?? dedupeKeyFor(input);
    // N-9: the counter is a cache recomputed from PostgreSQL and the hint is a refetch nudge. A cache
    // Redis outage must degrade only real-time push, never fail the job before the email step.
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
      // A later message in the same window: one row, bumped; count it again only if it had been read.
      if (input.dedupeKey && (await deps.store.bump(id)).wasRead)
        await announce(id);
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
      await announce(id);
    }

    if (!input.emailTo) return;
    // decideChannel ignores the row for TRANSACTIONAL, so do not look it up (spec D12-4).
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

    // N-5 step 2: a bounced/complained address gets in-app only.
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
