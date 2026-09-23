import { createHash } from "node:crypto";

export type EmailMessage = { to: string; subject: string; text: string };

export type EmailSendOptions = {
  /** Aborts the wait for the provider (the socket is still bounded by the adapter's own timeouts). */
  signal?: AbortSignal;
  /** Becomes the Message-ID, so a re-send of the same event carries the same id (helps receivers dedupe). */
  messageKey?: string;
};

export interface EmailPort {
  send(message: EmailMessage, options?: EmailSendOptions): Promise<void>;
  /** True when the address (as `hashEmail`) bounced or complained and must not be mailed (spec N-10). */
  isSuppressed(emailHash: string): Promise<boolean>;
}

/** The `email_suppression.email_hash` key: sha256 hex of the trimmed, lower-cased address. Never store the address. */
export function hashEmail(address: string): string {
  return createHash("sha256")
    .update(address.trim().toLowerCase())
    .digest("hex");
}

/** `retryable`: try again later (4xx, network, timeout). `permanent`: retrying cannot help (5xx, bad credentials). */
export class EmailSendError extends Error {
  readonly kind: "retryable" | "permanent";

  constructor(
    message: string,
    kind: "retryable" | "permanent",
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "EmailSendError";
    this.kind = kind;
  }
}
