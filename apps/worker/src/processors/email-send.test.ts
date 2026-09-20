import { describe, expect, it, vi } from "vitest";

import { EmailSendError } from "@nitap/email";
import type { EmailPort } from "@nitap/email";
import { PermanentJobError } from "@nitap/jobs";
import type { EmailSendPayload } from "@nitap/jobs";

import { silentLogger } from "../../tests/support.ts";
import { createEmailSendProcessor } from "./email-send.ts";

const payload: EmailSendPayload = {
  v: 1,
  to: "person@example.test",
  template: "verify-email",
  params: {
    verificationUrl: "https://alumni.example/verify?t=abc",
    expiresInMinutes: 60,
  },
};
const context = (over = {}) => ({
  jobId: "event-1",
  attempt: 1,
  requestId: "req-1",
  signal: new AbortController().signal,
  logger: silentLogger(),
  ...over,
});

describe("email.send processor", () => {
  it("renders the template and sends it to the recipient, keyed by the job id", async () => {
    const send = vi.fn<EmailPort["send"]>(async () => {});
    const c = context();

    await createEmailSendProcessor({ send })(payload, c);

    expect(send).toHaveBeenCalledTimes(1);
    const [message, options] = send.mock.calls[0]!;
    expect(message.to).toBe("person@example.test");
    expect(message.subject).toBe(
      "Verify your email for the NITAP Alumni Network"
    );
    expect(message.text).toContain("https://alumni.example/verify?t=abc");
    expect(options).toEqual({ signal: c.signal, messageKey: "event-1" });
  });

  it("gives a re-run of the same event the same Message-ID key", async () => {
    const send = vi.fn<EmailPort["send"]>(async () => {});
    const processor = createEmailSendProcessor({ send });

    await processor(payload, context());
    await processor(payload, context({ attempt: 2 }));

    expect(send.mock.calls[0]?.[1]?.messageKey).toBe(
      send.mock.calls[1]?.[1]?.messageKey
    );
  });

  it("lets a retryable email failure propagate so the queue retries it", async () => {
    const failure = new EmailSendError("SMTP 451", "retryable");
    const processor = createEmailSendProcessor({
      send: async () => Promise.reject(failure),
    });
    await expect(processor(payload, context())).rejects.toBe(failure);
  });

  it("turns a permanent email failure into a permanent job failure", async () => {
    const processor = createEmailSendProcessor({
      send: async () =>
        Promise.reject(new EmailSendError("SMTP 550", "permanent")),
    });
    await expect(processor(payload, context())).rejects.toBeInstanceOf(
      PermanentJobError
    );
  });

  it("logs that the email was sent without the recipient or the link", async () => {
    const logger = silentLogger();
    await createEmailSendProcessor({ send: async () => {} })(
      payload,
      context({ logger })
    );
    const logged = JSON.stringify(
      (logger.info as ReturnType<typeof vi.fn>).mock.calls
    );
    expect(logged).toContain("email.sent");
    expect(logged).not.toContain("person@example.test");
    expect(logged).not.toContain("alumni.example");
  });
});
