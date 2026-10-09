import { EmailSendError, renderEmail } from "@nitap/email";
import type { EmailPort } from "@nitap/email";
import { PermanentJobError } from "@nitap/jobs";
import type { EmailSendPayload } from "@nitap/jobs";
import type { JobProcessor } from "@nitap/queue";
import type { Metrics } from "@nitap/observability";

/** Never the raw provider message: SMTP replies often echo the recipient. */
const failureKind = (error: unknown) =>
  error instanceof EmailSendError
    ? /^SMTP \w+$/.test(error.message)
      ? `${error.kind}: ${error.message}`
      : error.kind
    : "unexpected";

/** The worker-side write path onto the EMAIL `NotificationDelivery` row. */
export type EmailDeliveryUpdater = {
  markSent(notificationId: string, attempt: number): Promise<void>;
  markFailed(
    notificationId: string,
    attempt: number,
    reason: string
  ): Promise<void>;
};

export type EmailSendProcessorDeps = {
  /** Present only when this worker also tracks notification delivery status. */
  deliveries?: EmailDeliveryUpdater;
  metrics?: Metrics;
  /** The job definition's `retry.attempts`, so a transient failure on the last try is treated as final. */
  maxAttempts?: number;
};

/**
 * The job id is the Message-ID key. Never logs the recipient or parameters. For notification emails,
 * the delivery row is marked SENT or FAILED; a failed status write is logged, never thrown, so a sent
 * email isn't re-sent.
 */
export function createEmailSendProcessor(
  email: Pick<EmailPort, "send">,
  deps: EmailSendProcessorDeps = {}
): JobProcessor<EmailSendPayload> {
  const { deliveries, metrics, maxAttempts = Infinity } = deps;

  return async (payload, context) => {
    const { subject, text } = renderEmail(payload);
    const notificationId =
      payload.template === "notification" ? payload.notificationId : undefined;
    // Same label keys on both counters so one selector covers sent and failed.
    const deliveryLabels = {
      channel: "EMAIL",
      category:
        (payload.template === "notification" && payload.category) || "unknown",
    };

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
        ...deliveryLabels,
      });
    };

    try {
      await email.send(
        { to: payload.to, subject, text },
        { signal: context.signal, messageKey: context.jobId }
      );
    } catch (error) {
      if (error instanceof EmailSendError && error.kind === "permanent") {
        await recordFailure(failureKind(error));
        throw new PermanentJobError(error.message, { cause: error });
      }
      if (context.attempt >= maxAttempts) {
        await recordFailure(failureKind(error));
      }
      throw error;
    }

    if (notificationId) {
      metrics?.increment("notification_delivered_total", deliveryLabels);
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
