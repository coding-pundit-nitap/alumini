import { describe, it, expect } from "vitest";
import { isValidRequestId, resolveRequestId } from "./request-id.ts";

describe("request id (reliability §6.2)", () => {
  it.each(["6f1c2c3e-aaaa-bbbb-cccc-1234567890ab", "abcdefgh", "A".repeat(64)])(
    "accepts a well-formed client id %s",
    (id) => {
      expect(isValidRequestId(id)).toBe(true);
      expect(resolveRequestId(id)).toBe(id);
    }
  );

  it.each([
    "",
    "short",
    "A".repeat(65),
    "has space in it",
    "line\nbreak-injection",
    'quote"injection-attempt',
    "<script>alert(1)</script>",
  ])("rejects %j and generates a UUID instead", (id) => {
    expect(isValidRequestId(id)).toBe(false);
    expect(resolveRequestId(id)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it("generates a UUID when there is no header", () => {
    expect(resolveRequestId(null)).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveRequestId(undefined)).not.toBe(resolveRequestId(undefined));
  });
});
