import { describe, expect, it } from "vitest";

import {
  accountStateInputSchema,
  grantInputSchema,
  userListQuerySchema,
} from "./user-query";

const CH = "00000000-0000-4000-8000-0000000000c1";

describe("user-query schemas", () => {
  it("drops empty GET fields and defaults the limit", () => {
    expect(userListQuerySchema.parse({ q: "", state: "", role: "" })).toEqual({
      limit: 50,
    });
  });
  it("rejects unknown filters", () => {
    expect(userListQuerySchema.safeParse({ department: "CSE" }).success).toBe(
      false
    );
  });
  it("requires a reason to suspend or deactivate, not to reactivate", () => {
    expect(
      accountStateInputSchema.safeParse({ accountState: "SUSPENDED" }).success
    ).toBe(false);
    expect(
      accountStateInputSchema.safeParse({
        accountState: "SUSPENDED",
        reason: "SPAM",
      }).success
    ).toBe(true);
    expect(
      accountStateInputSchema.safeParse({ accountState: "VERIFIED" }).success
    ).toBe(true);
  });
  it("rejects unknown body fields (mass assignment)", () => {
    expect(
      accountStateInputSchema.safeParse({
        accountState: "VERIFIED",
        roles: ["SUPER_ADMIN"],
      }).success
    ).toBe(false);
  });
  it("requires chapterId exactly when scope is CHAPTER", () => {
    expect(
      grantInputSchema.safeParse({
        permission: "event.manage",
        scope: "CHAPTER",
      }).success
    ).toBe(false);
    expect(
      grantInputSchema.safeParse({
        permission: "event.manage",
        scope: "GLOBAL",
        chapterId: CH,
      }).success
    ).toBe(false);
    expect(
      grantInputSchema.safeParse({
        permission: "event.manage",
        scope: "CHAPTER",
        chapterId: CH,
      }).success
    ).toBe(true);
  });
  it("allows CHAPTER scope only for the chapter bundle", () => {
    expect(
      grantInputSchema.safeParse({
        permission: "audit.read",
        scope: "CHAPTER",
        chapterId: CH,
      }).success
    ).toBe(false);
  });
  it("rejects an unknown permission", () => {
    expect(
      grantInputSchema.safeParse({ permission: "everything", scope: "GLOBAL" })
        .success
    ).toBe(false);
  });
});
