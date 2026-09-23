import { EmailSendError, renderEmail } from "@nitap/email";
import type { EmailPort } from "@nitap/email";
import { PermanentJobError } from "@nitap/jobs";
import type { EmailSendPayload } from "@nitap/jobs";
import type { JobProcessor } from "@nitap/queue";
import type { Metrics } from "@nitap/observability";

/** The worker-side write path onto the EMAIL `NotificationDelivery` row (spec N-12). */
export type EmailDeliveryUpdater = {
  markSent(notificationId: string, attempt: number): Promise<void>;
  markFailed(
    notificationId: string,
    attempt: number,
    reason: string
  ): Promise<void>;
};

export type EmailSendProcessorDeps = {
  /** Present only when this worker also tracks notification delivery status (N-12). */
  deliveries?: EmailDeliveryUpdater;
  metrics?: Metrics;
  /** The job definition's `retry.attempts`, so a transient failure on the last try is treated as final. */
  maxAttempts?: number;
};

/**
 * Sends one templated email. The job id is the Message-ID key, so a re-run of the same event carries the
 * same id. Never logs the recipient or the parameters: they hold an address and a token.
 *
 * When the payload is a `notification` template carrying a `notificationId` (N-12), the outcome is also
 * written back onto that notification's EMAIL delivery row: SENT on success, FAILED (with the
 * `notification_delivery_failed_total` metric) on a permanent error or the final retry attempt. A status
 * write never masks the real send outcome: a `markSent`/`markFailed` failure is logged, not thrown, so a
 * successfully sent email is never re-sent just because the status write failed.
 */
export function createEmailSendProcessor(
  email: EmailPort,
  deps: EmailSendProcessorDeps = {}
): JobProcessor<EmailSendPayload> {
  const { deliveries, metrics, maxAttempts = Infinity } = deps;

  return async (payload, context) => {
    const { subject, text } = renderEmail(payload);
    const notificationId =
      payload.template === "notification" ? payload.notificationId : undefined;

    const recordFailure = async (reason: string) => {
      if (!notificationId) return;
      try {
        await deliveries?.markFailed(notificationId, context.attempt, reason);
      } catch (error) {
        context.logger.error("notification.delivery.mark_failed_error", {
          error,
        });
      }
      metrics?.increment("notification_delivery_failed_total", {
        template: payload.template,
      });
    };

    try {
      await email.send(
        { to: payload.to, subject, text },
        { signal: context.signal, messageKey: context.jobId }
      );
    } catch (error) {
      if (error instanceof EmailSendError && error.kind === "permanent") {
        await recordFailure(error.message);
        throw new PermanentJobError(error.message, { cause: error });
      }
      if (context.attempt >= maxAttempts) {
        await recordFailure(
          error instanceof Error ? error.message : "send failed"
        );
      }
      throw error;
    }

    if (notificationId) {
      try {
        await deliveries?.markSent(notificationId, context.attempt);
      } catch (error) {
        // The email went out but the row stays PENDING: operators reconcile by notificationId.
        context.logger.error("notification.delivery.mark_sent_error", {
          error,
          metadata: { notificationId },
        });
      }
    }

    context.logger.info("email.sent", {
      metadata: { template: payload.template, attempt: context.attempt },
    });
  };
}
