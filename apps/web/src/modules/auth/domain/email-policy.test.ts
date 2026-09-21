import { describe, expect, it } from "vitest";

import { classifyEmail, type EmailPolicy } from "./email-policy";

const policy: EmailPolicy = new Map([
  ["nitap.ac.in", { role: "STUDENT", autoVerify: true }],
  ["staff.nitap.ac.in", { role: "STAFF", autoVerify: false }],
]);

describe("classifyEmail", () => {
  it("recognises a configured domain and returns its role and flag", () => {
    expect(classifyEmail("a@nitap.ac.in", policy)).toEqual({
      kind: "INSTITUTIONAL",
      role: "STUDENT",
      autoVerify: true,
    });
  });

  it("carries autoVerify false for a recognised domain that needs confirmation", () => {
    expect(classifyEmail("a@staff.nitap.ac.in", policy)).toEqual({
      kind: "INSTITUTIONAL",
      role: "STAFF",
      autoVerify: false,
    });
  });

  it("is case-insensitive on the domain", () => {
    expect(classifyEmail("A@NITAP.AC.IN", policy).kind).toBe("INSTITUTIONAL");
  });

  it.each([
    ["a@gmail.com"],
    ["a@nitap.ac.in.evil.com"],
    ["a@evilnitap.ac.in"],
    ["a@sub.nitap.ac.in"],
    ["a@nitap.ac.in."],
    ['"a@nitap.ac.in"@evil.com'],
    ["a@nitap.ac.in@evil.com"],
    ["a @nitap.ac.in"],
    ["no-at-sign"],
    ["@nitap.ac.in"],
    [""],
  ])("does not recognise %s", (email) => {
    expect(classifyEmail(email, policy)).toEqual({ kind: "EXTERNAL" });
  });

  it("recognises nothing when the policy is empty", () => {
    expect(classifyEmail("a@nitap.ac.in", new Map())).toEqual({
      kind: "EXTERNAL",
    });
  });
});
