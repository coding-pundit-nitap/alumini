import { describe, expect, it } from "vitest";

import type { EmailSendPayload } from "@nitap/jobs";

import { AUTH_LINK_TTL_MINUTES, createAuthEmailSender } from "./auth-emails";

function setup() {
  const sent: EmailSendPayload[] = [];
  const sender = createAuthEmailSender({
    outbox: {
      async enqueue(payload) {
        sent.push(payload);
      },
    },
  });
  return { sent, sender };
}

describe("createAuthEmailSender", () => {
  it("queues a verify-email message with the link and its lifetime", async () => {
    const { sent, sender } = setup();
    await sender.verification(
      "a@x.test",
      "https://app.test/api/auth/verify-email?token=t"
    );
    expect(sent).toEqual([
      {
        v: 1,
        to: "a@x.test",
        template: "verify-email",
        params: {
          verificationUrl: "https://app.test/api/auth/verify-email?token=t",
          expiresInMinutes: AUTH_LINK_TTL_MINUTES,
        },
      },
    ]);
  });

  it("queues a reset-password message", async () => {
    const { sent, sender } = setup();
    await sender.passwordReset(
      "a@x.test",
      "https://app.test/api/auth/reset-password/t"
    );
    expect(sent[0]).toMatchObject({
      template: "reset-password",
      params: {
        resetUrl: "https://app.test/api/auth/reset-password/t",
        expiresInMinutes: AUTH_LINK_TTL_MINUTES,
      },
    });
  });

  it("queues an existing-account notice with no parameters", async () => {
    const { sent, sender } = setup();
    await sender.existingAccount("a@x.test");
    expect(sent[0]).toEqual({
      v: 1,
      to: "a@x.test",
      template: "existing-account",
      params: {},
    });
  });
});
