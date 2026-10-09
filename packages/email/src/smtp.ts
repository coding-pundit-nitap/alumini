import nodemailer from "nodemailer";

import { EmailSendError } from "./port.ts";
import type { EmailMessage, EmailPort, EmailSendOptions } from "./port.ts";

export type SmtpEmailPortOptions = {
  /** `smtp://[user:pass@]host[:port]` or `smtps://…`. */
  url: string;
  /** The From header, e.g. `NITAP Alumni <no-reply@alumni.example>`. */
  from: string;
  connectionTimeoutMs?: number;
  greetingTimeoutMs?: number;
  socketTimeoutMs?: number;
  /** Lookup by `hashEmail`. Defaults to nothing suppressed. */
  isSuppressed?: (emailHash: string) => Promise<boolean>;
};

const RETRYABLE_CODES = new Set([
  "ECONNECTION",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ESOCKET",
  "EDNS",
  "EPROTOCOL",
]);

/** Classifies as retryable or permanent without copying the message, which often echoes the recipient. */
function classify(error: unknown): EmailSendError {
  if (error instanceof EmailSendError) return error;
  const { code, responseCode } = error as {
    code?: string;
    responseCode?: number;
  };
  if (typeof responseCode === "number") {
    return new EmailSendError(
      `SMTP ${responseCode}`,
      responseCode >= 500 ? "permanent" : "retryable",
      { cause: error }
    );
  }
  if (code === "EAUTH") {
    // Wrong credentials affect every message; fail fast and loud instead of retrying for hours.
    return new EmailSendError("SMTP authentication failed", "permanent", {
      cause: error,
    });
  }
  return new EmailSendError(
    `SMTP ${code && RETRYABLE_CODES.has(code) ? code : "error"}`,
    "retryable",
    { cause: error }
  );
}

function aborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    signal.addEventListener(
      "abort",
      () => reject(new EmailSendError("Send aborted", "retryable")),
      { once: true }
    );
  });
}

export function createSmtpEmailPort(
  options: SmtpEmailPortOptions
): EmailPort & { close(): void } {
  const url = new URL(options.url);
  const secure = url.protocol === "smtps:";
  const transporter = nodemailer.createTransport({
    host: url.hostname,
    port: url.port ? Number(url.port) : secure ? 465 : 587,
    secure,
    auth: url.username
      ? {
          user: decodeURIComponent(url.username),
          pass: decodeURIComponent(url.password),
        }
      : undefined,
    connectionTimeout: options.connectionTimeoutMs ?? 5_000,
    greetingTimeout: options.greetingTimeoutMs ?? 5_000,
    socketTimeout: options.socketTimeoutMs ?? 15_000,
  });

  return {
    async send(message: EmailMessage, sendOptions: EmailSendOptions = {}) {
      const { signal, messageKey } = sendOptions;
      if (signal?.aborted) {
        throw new EmailSendError("Send aborted", "retryable");
      }
      try {
        const sending = transporter.sendMail({
          from: options.from,
          to: message.to,
          subject: message.subject,
          text: message.text,
          messageId: messageKey ? `<${messageKey}@nitap.invalid>` : undefined,
        });
        await (signal ? Promise.race([sending, aborted(signal)]) : sending);
      } catch (error) {
        throw classify(error);
      }
    },
    isSuppressed: options.isSuppressed ?? (async () => false),
    close() {
      transporter.close();
    },
  };
}
