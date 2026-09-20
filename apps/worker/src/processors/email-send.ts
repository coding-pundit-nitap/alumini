import { EmailSendError, renderEmail } from "@nitap/email";
import type { EmailPort } from "@nitap/email";
import { PermanentJobError } from "@nitap/jobs";
import type { EmailSendPayload } from "@nitap/jobs";
import type { JobProcessor } from "@nitap/queue";

/**
 * Sends one templated email. The job id is the Message-ID key, so a re-run of the same event carries the
 * same id. Never logs the recipient or the parameters: they hold an address and a token.
 */
export function createEmailSendProcessor(
  email: EmailPort
): JobProcessor<EmailSendPayload> {
  return async (payload, context) => {
    const { subject, text } = renderEmail(payload);
    try {
      await email.send(
        { to: payload.to, subject, text },
        { signal: context.signal, messageKey: context.jobId }
      );
    } catch (error) {
      if (error instanceof EmailSendError && error.kind === "permanent") {
        throw new PermanentJobError(error.message, { cause: error });
      }
      throw error;
    }
    context.logger.info("email.sent", {
      metadata: { template: payload.template, attempt: context.attempt },
    });
  };
}
