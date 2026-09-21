import { describe, expect, it } from "vitest";

import {
  InvalidEmailPolicyError,
  parseEmailPolicy,
} from "./email-policy-config";

const valid = JSON.stringify({
  "nitap.ac.in": { role: "STUDENT", autoVerify: true },
  "staff.nitap.ac.in": { role: "STAFF", autoVerify: false },
});

describe("parseEmailPolicy", () => {
  it("treats an unset or blank value as no institutional domain", () => {
    expect(parseEmailPolicy(undefined).size).toBe(0);
    expect(parseEmailPolicy("  ").size).toBe(0);
  });

  it("parses domains with their role and flag", () => {
    const policy = parseEmailPolicy(valid);
    expect(policy.get("nitap.ac.in")).toEqual({
      role: "STUDENT",
      autoVerify: true,
    });
    expect(policy.get("staff.nitap.ac.in")).toEqual({
      role: "STAFF",
      autoVerify: false,
    });
  });

  it.each([
    ["not json", "{nope"],
    ["an array", "[]"],
    ["an admin role", '{"a.example":{"role":"SUPER_ADMIN","autoVerify":true}}'],
    ["an unknown role", '{"a.example":{"role":"WIZARD","autoVerify":true}}'],
    ["a missing flag", '{"a.example":{"role":"STUDENT"}}'],
    [
      "a non-boolean flag",
      '{"a.example":{"role":"STUDENT","autoVerify":"yes"}}',
    ],
    [
      "an extra key",
      '{"a.example":{"role":"STUDENT","autoVerify":true,"x":1}}',
    ],
    [
      "an uppercase domain",
      '{"A.example":{"role":"STUDENT","autoVerify":true}}',
    ],
    [
      "a wildcard domain",
      '{"*.a.example":{"role":"STUDENT","autoVerify":true}}',
    ],
    [
      "a domain with no dot",
      '{"localhost":{"role":"STUDENT","autoVerify":true}}',
    ],
  ])("rejects %s (fails closed)", (_name, raw) => {
    expect(() => parseEmailPolicy(raw)).toThrow(InvalidEmailPolicyError);
  });

  it("never echoes the configured value in the error", () => {
    try {
      parseEmailPolicy('{"a.example":{"role":"WIZARD","autoVerify":true}}');
      expect.unreachable();
    } catch (error) {
      expect(String((error as Error).message)).not.toContain("a.example");
    }
  });
});
