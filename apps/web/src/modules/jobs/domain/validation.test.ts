import { describe, expect, it } from "vitest";

import { createJobInput, editJobInput, rejectJobInput } from "./validation";

const valid = {
  title: "Backend Engineer",
  company: "Acme",
  description: "Build things",
  employmentType: "FULL_TIME",
  location: "Remote",
  workMode: "REMOTE",
  experience: "2+ years",
  skills: ["Node", "node", "  TypeScript  "],
  applicationUrl: "https://acme.example/apply",
  deadline: "2026-12-01",
};

describe("createJobInput", () => {
  it("accepts a valid posting and normalises skills (trim, lower-case, de-dupe)", () => {
    const parsed = createJobInput.parse(valid);
    expect(parsed.skills).toEqual(["node", "typescript"]);
    expect(parsed.deadline).toBeInstanceOf(Date);
  });

  it("rejects a non-https application_url: http://", () => {
    expect(
      createJobInput.safeParse({
        ...valid,
        applicationUrl: "http://acme.example",
      }).success
    ).toBe(false);
  });
  it("rejects a non-https application_url: javascript:", () => {
    expect(
      createJobInput.safeParse({
        ...valid,
        applicationUrl: "javascript:alert(1)",
      }).success
    ).toBe(false);
  });
  it("rejects a non-https application_url: data:", () => {
    expect(
      createJobInput.safeParse({
        ...valid,
        applicationUrl: "data:text/plain,hi",
      }).success
    ).toBe(false);
  });
  it("rejects a non-https application_url: bare string with no scheme", () => {
    expect(
      createJobInput.safeParse({ ...valid, applicationUrl: "acme.example" })
        .success
    ).toBe(false);
  });

  it("rejects more than 20 skills, and a skill over 40 chars", () => {
    expect(
      createJobInput.safeParse({
        ...valid,
        skills: Array.from({ length: 21 }, (_, i) => `s${i}`),
      }).success
    ).toBe(false);
    expect(
      createJobInput.safeParse({ ...valid, skills: ["x".repeat(41)] }).success
    ).toBe(false);
  });
  it("rejects unknown fields (strict)", () => {
    expect(createJobInput.safeParse({ ...valid, extra: "no" }).success).toBe(
      false
    );
  });
});

describe("editJobInput", () => {
  it("accepts the same shape as createJobInput", () => {
    expect(editJobInput.safeParse(valid).success).toBe(true);
  });
});

describe("rejectJobInput", () => {
  it("requires a non-empty, <=1000-char reviewNote", () => {
    expect(
      rejectJobInput.safeParse({ reviewNote: "Add a salary range" }).success
    ).toBe(true);
    expect(rejectJobInput.safeParse({ reviewNote: "" }).success).toBe(false);
    expect(
      rejectJobInput.safeParse({ reviewNote: "x".repeat(1001) }).success
    ).toBe(false);
    expect(rejectJobInput.safeParse({}).success).toBe(false);
  });
});
