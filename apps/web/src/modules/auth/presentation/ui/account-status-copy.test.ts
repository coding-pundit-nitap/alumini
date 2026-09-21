import { describe, expect, it } from "vitest";

import { ACCOUNT_STATES } from "../../domain/actor";
import { accountStatusCopy } from "./account-status-copy";

describe("accountStatusCopy", () => {
  it("has plain-language copy for every state except VERIFIED", () => {
    for (const state of ACCOUNT_STATES) {
      const copy = accountStatusCopy(state);
      if (state === "VERIFIED") {
        expect(copy).toBeNull();
      } else {
        expect(copy?.title).toBeTruthy();
        expect(copy?.body).toBeTruthy();
      }
    }
  });

  it("says PENDING is awaiting verification and promises nothing about timing", () => {
    const copy = accountStatusCopy("PENDING");
    expect(copy?.title).toMatch(/awaiting verification/i);
    expect(copy?.body).not.toMatch(/\b(hour|day|week)s?\b/i);
  });

  it("does not reveal a reason for a suspension", () => {
    expect(accountStatusCopy("SUSPENDED")?.body).toMatch(/contact/i);
  });
});
