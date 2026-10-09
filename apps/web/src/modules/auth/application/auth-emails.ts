import type { EmailSendPayload } from "@nitap/jobs";

/** Better Auth's verification and reset links both live 60 minutes; the templates say so. */
export const AUTH_LINK_TTL_MINUTES = 60;

/** Where an email request is recorded durably. The adapter writes an outbox row. */
export type EmailOutbox = {
  enqueue(payload: EmailSendPayload): Promise<void>;
};

/**
 * The three messages the identity flows send. They replace fire-and-forget sending: a provider outage
 * no longer fails registration, the row waits in the outbox and the worker retries. Never log the
 * recipient or the link.
 */
export function createAuthEmailSender(deps: { outbox: EmailOutbox }) {
  return {
    verification: (to: string, verificationUrl: string) =>
      deps.outbox.enqueue({
        v: 1,
        to,
        template: "verify-email",
        params: { verificationUrl, expiresInMinutes: AUTH_LINK_TTL_MINUTES },
      }),
    passwordReset: (to: string, resetUrl: string) =>
      deps.outbox.enqueue({
        v: 1,
        to,
        template: "reset-password",
        params: { resetUrl, expiresInMinutes: AUTH_LINK_TTL_MINUTES },
      }),
    existingAccount: (to: string) =>
      deps.outbox.enqueue({
        v: 1,
        to,
        template: "existing-account",
        params: {},
      }),
  };
}

export type AuthEmailSender = ReturnType<typeof createAuthEmailSender>;
