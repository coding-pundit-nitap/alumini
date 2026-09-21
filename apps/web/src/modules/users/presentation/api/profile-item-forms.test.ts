import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/errors";

import { parseItemId } from "./parse-form";
import {
  parseEducationForm,
  parseExperienceForm,
  parseLinkForm,
  parseSkillForm,
} from "./profile-item-forms";

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
};

describe("parseExperienceForm", () => {
  const valid = {
    company: "Acme",
    industry: "Robotics",
    designation: "Engineer",
    startDate: "2020-01-01",
    endDate: "2021-01-01",
  };

  it("reads only the named fields", () => {
    expect(parseExperienceForm(form(valid))).toEqual({
      ...valid,
      isCurrent: false,
    });
  });

  it("ignores a forged id or userId", () => {
    const parsed = parseExperienceForm(
      form({ ...valid, id: "x", userId: "y" })
    );
    expect(parsed).toEqual({ ...valid, isCurrent: false });
  });

  it("throws a ValidationError for a bad field", () => {
    expect(() => parseExperienceForm(form({ ...valid, company: "" }))).toThrow(
      ValidationError
    );
  });
});

describe("parseEducationForm", () => {
  const valid = {
    institution: "IIT Madras",
    qualification: "M.Tech",
    fieldOfStudy: "Robotics",
    startYear: "2019",
    endYear: "2021",
  };

  it("reads only the named fields", () => {
    expect(parseEducationForm(form(valid))).toEqual({
      ...valid,
      startYear: 2019,
      endYear: 2021,
    });
  });

  it("throws a ValidationError for an out-of-range year", () => {
    expect(() =>
      parseEducationForm(form({ ...valid, startYear: "1900" }))
    ).toThrow(ValidationError);
  });
});

describe("parseSkillForm", () => {
  it("reads and normalises the skill field", () => {
    expect(parseSkillForm(form({ skill: "  Go  " }))).toEqual({ skill: "Go" });
  });

  it("throws for an empty skill", () => {
    expect(() => parseSkillForm(form({ skill: "" }))).toThrow(ValidationError);
  });
});

describe("parseLinkForm", () => {
  it("reads and normalises the link", () => {
    expect(
      parseLinkForm(form({ type: "GITHUB", url: "https://GitHub.com/asha" }))
    ).toEqual({ type: "GITHUB", url: "https://github.com/asha" });
  });

  it("throws for an unsafe scheme", () => {
    expect(() =>
      parseLinkForm(form({ type: "WEBSITE", url: "javascript:alert(1)" }))
    ).toThrow(ValidationError);
  });
});

describe("parseItemId", () => {
  it("accepts a UUID", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(parseItemId(form({ id }))).toBe(id);
  });

  it("throws for a missing or malformed id", () => {
    expect(() => parseItemId(form({}))).toThrow(ValidationError);
    expect(() => parseItemId(form({ id: "not-a-uuid" }))).toThrow(
      ValidationError
    );
  });
});
