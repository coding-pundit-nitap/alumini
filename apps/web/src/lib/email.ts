type Email = {
  to: string;
  subject: string;
  text: string;
};

/**
 * Placeholder email transport.
 *
 * Target design (docs/adr/ADR-005 §5, ADR-007): callers write an OUTBOX_EVENT and a
 * worker sends the email with retries, so a provider outage never blocks or loses a message.
 * Neither the outbox table nor a provider exists yet, so until they do:
 *  - development logs the message (the verification / reset link is in the text), and
 *  - production throws, so a missing email setup fails loudly instead of silently dropping links.
 */
export async function sendEmail(email: Email): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Email delivery is not configured");
  }

  console.info(
    `[email] to=${email.to} subject="${email.subject}"\n${email.text}`
  );
}
