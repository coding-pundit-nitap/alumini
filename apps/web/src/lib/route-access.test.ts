import { describe, expect, it } from "vitest";

import { isPublicPath, safeNextPath } from "./route-access";

describe("isPublicPath", () => {
  it.each([
    "/",
    "/login",
    "/register",
    "/verify-email",
    "/verify-email/abc",
    "/reset-password",
    "/health/live",
    "/health",
    "/api/auth/sign-in/email",
    "/api/v1/jobs",
    "/members/0b8f6f4e-8f7e-4c2a-9f57-3a2a1f6d5c11",
    "/robots.txt",
    "/images/logo.svg",
  ])("treats %s as public", (pathname) => {
    expect(isPublicPath(pathname)).toBe(true);
  });

  it.each([
    "/alumni",
    "/membership",
    "/alumni/123",
    "/admin",
    "/loginx",
    "/login-help/secret",
    "/healthcheck",
    "/apis",
    "/profile/edit",
  ])("treats %s as gated", (pathname) => {
    expect(isPublicPath(pathname)).toBe(false);
  });
});

describe("safeNextPath (open-redirect guard)", () => {
  it.each([
    ["/alumni", "/alumni"],
    ["/alumni?q=a&page=2", "/alumni?q=a&page=2"],
    ["/", "/"],
  ])("keeps the same-origin path %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    "//evil.com",
    "//evil.com/x",
    "/\\evil.com",
    "https://evil.com",
    "http://evil.com/a",
    "javascript:alert(1)",
    "evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    " //evil.com",
    "",
    null,
    undefined,
  ])("falls back to / for %j", (input) => {
    expect(safeNextPath(input)).toBe("/");
  });
});
