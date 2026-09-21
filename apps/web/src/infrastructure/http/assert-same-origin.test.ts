import { describe, expect, it, vi } from "vitest";

vi.mock("@/config/env", () => ({
  env: { BETTER_AUTH_URL: "https://alumni.example.test/" },
}));

import { AuthorizationError } from "@/lib/errors";

import { assertSameOrigin } from "./assert-same-origin";

const req = (origin?: string) =>
  new Request("https://alumni.example.test/api/v1/connections", {
    method: "POST",
    headers: origin ? { origin } : {},
  });

describe("assertSameOrigin", () => {
  it("accepts the app's own origin and a request with no Origin header", () => {
    expect(() =>
      assertSameOrigin(req("https://alumni.example.test"))
    ).not.toThrow();
    expect(() => assertSameOrigin(req())).not.toThrow();
  });

  it("refuses a foreign origin with ORIGIN_NOT_ALLOWED", () => {
    try {
      assertSameOrigin(req("https://evil.example.test"));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AuthorizationError);
      expect((error as AuthorizationError).code).toBe("ORIGIN_NOT_ALLOWED");
    }
  });
});
