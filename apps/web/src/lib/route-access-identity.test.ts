import { describe, expect, it } from "vitest";

import { isPublicPath, safeNextPath } from "./route-access";

describe("identity routes (spec 2C §3.4)", () => {
  it.each([
    "/login",
    "/register",
    "/register/check-email",
    "/verify-email",
    "/forgot-password",
    "/reset-password",
  ])("%s is reachable while signed out", (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  it.each(["/account/status", "/post-login", "/account", "/profile"])(
    "%s requires a session cookie",
    (path) => {
      expect(isPublicPath(path)).toBe(false);
    }
  );
});

describe("safeNextPath open-redirect cases", () => {
  it.each([
    ["//evil.com"],
    ["/\\evil.com"],
    ["https://evil.com"],
    ["javascript:alert(1)"],
    ["evil.com"],
    ["/\t/evil.com"],
    [null],
    [undefined],
    [""],
  ])("turns %s into /dashboard", (candidate) => {
    expect(safeNextPath(candidate as string | null | undefined)).toBe(
      "/dashboard"
    );
  });

  it("keeps a same-origin path with a query", () => {
    expect(safeNextPath("/profile?tab=edu")).toBe("/profile?tab=edu");
  });
});
