import { describe, expect, it } from "vitest";

import { emailSendPayload } from "./email.ts";

describe("email.send verification templates", () => {
  it.each(["verification-approved", "verification-rejected"] as const)(
    "accepts %s with empty params",
    (template) => {
      expect(
        emailSendPayload.safeParse({
          v: 1,
          to: "asha@example.test",
          template,
          params: {},
        }).success
      ).toBe(true);
    }
  );

  it.each(["verification-approved", "verification-rejected"] as const)(
    "rejects %s carrying any parameter (a reviewer note must never travel by email)",
    (template) => {
      expect(
        emailSendPayload.safeParse({
          v: 1,
          to: "asha@example.test",
          template,
          params: { note: "free text" },
        }).success
      ).toBe(false);
    }
  );
});
