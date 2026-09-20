import { describe, expect, it } from "vitest";

import { emailSend, emailSendPayload } from "./email.ts";

const verify = {
  v: 1,
  to: "person@example.test",
  template: "verify-email",
  params: {
    verificationUrl: "https://alumni.example/verify?t=abc",
    expiresInMinutes: 60,
  },
};

describe("email.send payload", () => {
  it("accepts each template with its own params", () => {
    expect(emailSendPayload.safeParse(verify).success).toBe(true);
    expect(
      emailSendPayload.safeParse({
        v: 1,
        to: "p@example.test",
        template: "reset-password",
        params: {
          resetUrl: "https://alumni.example/reset?t=abc",
          expiresInMinutes: 60,
        },
      }).success
    ).toBe(true);
    expect(
      emailSendPayload.safeParse({
        v: 1,
        to: "p@example.test",
        template: "existing-account",
        params: {},
      }).success
    ).toBe(true);
  });

  it.each([
    ["an unknown template", { ...verify, template: "nope" }],
    ["a bad recipient", { ...verify, to: "not-an-email" }],
    [
      "params of another template",
      { ...verify, params: { resetUrl: "https://x.example" } },
    ],
    ["extra params", { ...verify, params: { ...verify.params, extra: 1 } }],
    [
      "a javascript: link",
      {
        ...verify,
        params: { ...verify.params, verificationUrl: "javascript:alert(1)" },
      },
    ],
    [
      "a non-positive expiry",
      { ...verify, params: { ...verify.params, expiresInMinutes: 0 } },
    ],
    ["another payload version", { ...verify, v: 2 }],
  ])("rejects %s", (_label, payload) => {
    expect(emailSendPayload.safeParse(payload).success).toBe(false);
  });

  it("is a single-purpose job on the email queue that states its idempotency rule", () => {
    expect(emailSend.name).toBe("email.send");
    expect(emailSend.queue).toBe("email");
    expect(emailSend.idempotency).toMatch(/duplicate/i);
  });
});
