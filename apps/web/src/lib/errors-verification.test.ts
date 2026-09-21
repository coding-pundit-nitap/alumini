import { describe, expect, it } from "vitest";

import { AuthorizationError, ConflictError, ERROR_CATALOG } from "./errors";

describe("verification error codes", () => {
  it.each([
    ["SELF_REVIEW_FORBIDDEN", 403],
    ["VERIFICATION_LOCKED", 403],
    ["VERIFICATION_NOT_APPLICABLE", 403],
    ["VERIFICATION_REQUEST_OPEN", 409],
    ["ACCOUNT_NOT_REVIEWABLE", 409],
  ])("%s is in the catalogue with status %i", (code, status) => {
    expect(ERROR_CATALOG[code]?.status).toBe(status);
    expect(ERROR_CATALOG[code]?.message.length).toBeGreaterThan(0);
  });

  it("an AuthorizationError can carry a specific code and keeps status 403", () => {
    const error = new AuthorizationError({ code: "SELF_REVIEW_FORBIDDEN" });
    expect(error.status).toBe(403);
    expect(error.code).toBe("SELF_REVIEW_FORBIDDEN");
    expect(error.message).toBe(ERROR_CATALOG.SELF_REVIEW_FORBIDDEN?.message);
  });

  it("a ConflictError takes its message from the catalogue", () => {
    expect(new ConflictError("VERIFICATION_REQUEST_OPEN").message).toBe(
      ERROR_CATALOG.VERIFICATION_REQUEST_OPEN?.message
    );
  });
});
