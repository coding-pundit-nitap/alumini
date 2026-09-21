import { describe, expect, it } from "vitest";

import { authErrorMessage } from "./auth-errors";

describe("authErrorMessage", () => {
  it.each([
    ["INVALID_EMAIL_OR_PASSWORD", /incorrect/i],
    ["EMAIL_NOT_VERIFIED", /confirm your email/i],
    ["ACCOUNT_DEACTIVATED", /deactivated/i],
    ["TOKEN_EXPIRED", /expired/i],
    ["INVALID_TOKEN", /invalid or has already been used/i],
  ])("maps %s", (code, expected) => {
    expect(authErrorMessage({ code })).toMatch(expected);
  });

  it("maps a 429 whatever the code", () => {
    expect(authErrorMessage({ status: 429, code: "X" })).toMatch(/too many/i);
  });

  it("falls back to a generic message and never echoes an unknown code", () => {
    const message = authErrorMessage({ code: "SOMETHING_INTERNAL" });
    expect(message).toMatch(/something went wrong/i);
    expect(message).not.toContain("SOMETHING_INTERNAL");
    expect(authErrorMessage(null)).toMatch(/something went wrong/i);
  });
});
