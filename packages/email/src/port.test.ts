import { describe, expect, it } from "vitest";

import { hashEmail } from "./port.ts";
import { createSmtpEmailPort } from "./smtp.ts";

describe("email suppression (N-10)", () => {
  it("hashes an address case- and whitespace-insensitively to sha256 hex, never the address itself", () => {
    const hash = hashEmail(" Person@Example.TEST ");
    expect(hash).toBe(hashEmail("person@example.test"));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("the SMTP port answers isSuppressed from the lookup it is given, default none", async () => {
    const base = { url: "smtp://127.0.0.1:1", from: "a@b.test" };
    const plain = createSmtpEmailPort(base);
    const checked = createSmtpEmailPort({
      ...base,
      isSuppressed: async (h) => h === hashEmail("x@y.test"),
    });
    try {
      expect(await plain.isSuppressed(hashEmail("x@y.test"))).toBe(false);
      expect(await checked.isSuppressed(hashEmail("X@y.test"))).toBe(true);
      expect(await checked.isSuppressed(hashEmail("z@y.test"))).toBe(false);
    } finally {
      plain.close();
      checked.close();
    }
  });
});
