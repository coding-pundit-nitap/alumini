import { describe, expect, it } from "vitest";

import { renderEmail } from "./templates.ts";

describe("renderEmail", () => {
  it("renders the verification email with the link and its lifetime", () => {
    const { subject, text } = renderEmail({
      template: "verify-email",
      params: {
        verificationUrl: "https://alumni.example/verify?t=abc",
        expiresInMinutes: 60,
      },
    });
    expect(subject).toBe("Verify your email for the NITAP Alumni Network");
    expect(text).toContain("https://alumni.example/verify?t=abc");
    expect(text).toContain("60 minutes");
  });

  it("renders the password reset email with the link and its lifetime", () => {
    const { subject, text } = renderEmail({
      template: "reset-password",
      params: {
        resetUrl: "https://alumni.example/reset?t=abc",
        expiresInMinutes: 30,
      },
    });
    expect(subject).toBe("Reset your NITAP Alumni Network password");
    expect(text).toContain("https://alumni.example/reset?t=abc");
    expect(text).toContain("30 minutes");
    expect(text).toMatch(/did not request/i);
  });

  it("renders the existing-account notice without a link", () => {
    const { subject, text } = renderEmail({
      template: "existing-account",
      params: {},
    });
    expect(subject).toBe("Someone tried to register with your email");
    expect(text).not.toMatch(/https?:\/\//);
    expect(text).toMatch(/sign in or reset your password/i);
  });
});
