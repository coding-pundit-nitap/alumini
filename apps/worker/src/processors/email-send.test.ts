import { describe, expect, it, vi } from "vitest";

import { EmailSendError } from "@nitap/email";
import type { EmailPort } from "@nitap/email";
import { PermanentJobError } from "@nitap/jobs";
import type { EmailSendPayload } from "@nitap/jobs";

import { silentLogger, recordingMetrics } from "../../tests/support.ts";
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
const notificationPayload: EmailSendPayload = {
  v: 1,
  to: "person@example.test",
  template: "notification",
  notificationId: "11111111-1111-4111-8111-111111111111",
  params: {
    title: "New connection",
    body: "Someone connected with you",
    actionUrl: "https://alumni.example/connections",
  },
};
const fakeDeliveries = (over = {}) => ({
  markSent: vi.fn(async () => {}),
  markFailed: vi.fn(async () => {}),
  ...over,
});
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

  describe("delivery status tracking (N-12)", () => {
    it("counts a sent notification email by channel and category (spec 13A A-11)", async () => {
      const metrics = recordingMetrics();
      const processor = createEmailSendProcessor(
        { send: async () => {} },
        { deliveries: fakeDeliveries(), metrics }
      );

      await processor(
        { ...notificationPayload, category: "ENGAGEMENT" },
        context()
      );
      await processor(notificationPayload, context());

      expect(metrics.increment).toHaveBeenNthCalledWith(
        1,
        "notification_delivered_total",
        { channel: "EMAIL", category: "ENGAGEMENT" }
      );
      // Jobs enqueued before 13A carry no category.
      expect(metrics.increment).toHaveBeenNthCalledWith(
        2,
        "notification_delivered_total",
        { channel: "EMAIL", category: "unknown" }
      );
    });

    it("labels a failed notification email with the same channel and category", async () => {
      const metrics = recordingMetrics();
      const processor = createEmailSendProcessor(
        {
          send: async () =>
            Promise.reject(new EmailSendError("SMTP 550", "permanent")),
        },
        { deliveries: fakeDeliveries(), metrics }
      );

      await expect(
        processor(
          { ...notificationPayload, category: "TRANSACTIONAL" },
          context()
        )
      ).rejects.toBeInstanceOf(PermanentJobError);

      expect(metrics.increment).toHaveBeenCalledWith(
        "notification_delivery_failed_total",
        {
          template: "notification",
          channel: "EMAIL",
          category: "TRANSACTIONAL",
        }
      );
    });

    it("marks the delivery SENT on a successful notification email", async () => {
      const deliveries = fakeDeliveries();
      const processor = createEmailSendProcessor(
        { send: async () => {} },
        { deliveries }
      );

      await processor(notificationPayload, context());

      expect(deliveries.markSent).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
        1
      );
      expect(deliveries.markFailed).not.toHaveBeenCalled();
    });

    it("marks the delivery FAILED and bumps the metric on a permanent send error", async () => {
      const deliveries = fakeDeliveries();
      const metrics = recordingMetrics();
      const processor = createEmailSendProcessor(
        {
          send: async () =>
            Promise.reject(new EmailSendError("SMTP 550", "permanent")),
        },
        { deliveries, metrics, maxAttempts: 4 }
      );

      await expect(
        processor(notificationPayload, context())
      ).rejects.toBeInstanceOf(PermanentJobError);

      expect(deliveries.markFailed).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
        1,
        "permanent: SMTP 550"
      );
      expect(metrics.increment).toHaveBeenCalledWith(
        "notification_delivery_failed_total",
        expect.anything()
      );
    });

    it("leaves the delivery row alone on a transient failure that is not the final attempt", async () => {
      const deliveries = fakeDeliveries();
      const metrics = recordingMetrics();
      const failure = new EmailSendError("SMTP 451", "retryable");
      const processor = createEmailSendProcessor(
        { send: async () => Promise.reject(failure) },
        { deliveries, metrics, maxAttempts: 4 }
      );

      await expect(
        processor(notificationPayload, context({ attempt: 2 }))
      ).rejects.toBe(failure);

      expect(deliveries.markFailed).not.toHaveBeenCalled();
      expect(metrics.increment).not.toHaveBeenCalled();
    });

    it("marks FAILED and bumps the metric on the final transient attempt", async () => {
      const deliveries = fakeDeliveries();
      const metrics = recordingMetrics();
      const failure = new EmailSendError("SMTP 451", "retryable");
      const processor = createEmailSendProcessor(
        { send: async () => Promise.reject(failure) },
        { deliveries, metrics, maxAttempts: 4 }
      );

      await expect(
        processor(notificationPayload, context({ attempt: 4 }))
      ).rejects.toBe(failure);

      expect(deliveries.markFailed).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
        4,
        "retryable: SMTP 451"
      );
      expect(metrics.increment).toHaveBeenCalledWith(
        "notification_delivery_failed_total",
        expect.anything()
      );
    });

    it("stores an error kind/code in lastError, never a raw message that may echo the address (PII)", async () => {
      const deliveries = fakeDeliveries();
      const processor = createEmailSendProcessor(
        {
          send: async () =>
            Promise.reject(
              new Error("550 <recipient@example.test>: mailbox unavailable")
            ),
        },
        { deliveries, metrics: recordingMetrics(), maxAttempts: 1 }
      );
      const leaky = new EmailSendError(
        "rejected recipient@example.test",
        "permanent"
      );
      const permanent = createEmailSendProcessor(
        { send: async () => Promise.reject(leaky) },
        { deliveries, metrics: recordingMetrics() }
      );

      await expect(
        processor(notificationPayload, context({ attempt: 1 }))
      ).rejects.toThrow();
      await expect(
        permanent(notificationPayload, context({ attempt: 1 }))
      ).rejects.toThrow();

      const reasons = deliveries.markFailed.mock.calls.map(
        (c) => (c as unknown[])[2]
      );
      expect(reasons).toEqual(["unexpected", "permanent"]);
    });

    it("never touches deliveries for a payload without a notificationId", async () => {
      const deliveries = fakeDeliveries();
      const metrics = recordingMetrics();
      const processor = createEmailSendProcessor(
        { send: async () => {} },
        { deliveries, metrics, maxAttempts: 4 }
      );

      await processor(payload, context());

      expect(deliveries.markSent).not.toHaveBeenCalled();
      expect(deliveries.markFailed).not.toHaveBeenCalled();
    });

    it("does not fail the job when markSent itself throws", async () => {
      const logger = silentLogger();
      const deliveries = fakeDeliveries({
        markSent: vi.fn(async () => {
          throw new Error("db unreachable");
        }),
      });
      const processor = createEmailSendProcessor(
        { send: async () => {} },
        { deliveries }
      );

      await expect(
        processor(notificationPayload, context({ logger }))
      ).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith(
        "notification.delivery.mark_sent_error",
        expect.objectContaining({
          metadata: { notificationId: notificationPayload.notificationId },
        })
      );
    });
  });
});
