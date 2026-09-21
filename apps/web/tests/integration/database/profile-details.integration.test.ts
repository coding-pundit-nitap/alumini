import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runSeed } from "@nitap/database/seed";
import {
  createTestDatabase,
  expectConstraintViolation,
  type TestDatabase,
} from "@nitap/testing";

describe("profile detail tables (real PostgreSQL)", () => {
  let db: TestDatabase;
  let userId: string;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    const user = await db.prisma.user.create({
      data: { name: "Asha", email: "asha@example.test" },
    });
    userId = user.id;
    await db.prisma.profile.create({ data: { userId, fullName: "Asha" } });
  });

  afterEach(async () => {
    await db.drop();
  });

  const experience = (over: Record<string, unknown> = {}) => ({
    userId,
    company: "Acme",
    designation: "Engineer",
    startDate: new Date("2020-01-01"),
    endDate: new Date("2021-01-01"),
    isCurrent: false,
    ...over,
  });
  const education = (over: Record<string, unknown> = {}) => ({
    userId,
    institution: "IIT Madras",
    qualification: "M.Tech",
    startYear: 2019,
    endYear: 2021,
    ...over,
  });

  describe("profile_experience", () => {
    it("accepts a past role and a current role", async () => {
      await db.prisma.profileExperience.create({ data: experience() });
      await db.prisma.profileExperience.create({
        data: experience({ endDate: null, isCurrent: true }),
      });
    });

    it.each([
      [
        "an end date before the start date",
        { endDate: new Date("2019-01-01") },
        "ck_profile_experience_dates",
      ],
      [
        "is_current with an end date",
        { isCurrent: true },
        "ck_profile_experience_current",
      ],
      [
        "a past role without an end date",
        { endDate: null },
        "ck_profile_experience_current",
      ],
      [
        "an empty company",
        { company: "" },
        "ck_profile_experience_company_length",
      ],
      [
        "an over-long designation",
        { designation: "x".repeat(101) },
        "ck_profile_experience_designation_length",
      ],
      [
        "an over-long industry",
        { industry: "x".repeat(81) },
        "ck_profile_experience_industry_length",
      ],
    ])("rejects %s", async (_label, over, constraint) => {
      const error = await db.prisma.profileExperience
        .create({ data: experience(over) })
        .catch((e) => e);
      expectConstraintViolation(error, constraint);
    });
  });

  describe("profile_education", () => {
    it("accepts a finished and an ongoing entry", async () => {
      await db.prisma.profileEducation.create({ data: education() });
      await db.prisma.profileEducation.create({
        data: education({ endYear: null }),
      });
    });

    it.each([
      [
        "an end year before the start year",
        { endYear: 2018 },
        "ck_profile_education_years",
      ],
      [
        "a start year out of range",
        { startYear: 1949 },
        "ck_profile_education_start_year",
      ],
      [
        "an end year out of range",
        { endYear: 2101 },
        "ck_profile_education_end_year",
      ],
      [
        "an empty institution",
        { institution: "" },
        "ck_profile_education_institution_length",
      ],
      [
        "an over-long qualification",
        { qualification: "x".repeat(101) },
        "ck_profile_education_qualification_length",
      ],
    ])("rejects %s", async (_label, over, constraint) => {
      const error = await db.prisma.profileEducation
        .create({ data: education(over) })
        .catch((e) => e);
      expectConstraintViolation(error, constraint);
    });
  });

  describe("profile_skill", () => {
    it("rejects a duplicate that differs only in case, at the database", async () => {
      await db.prisma.profileSkill.create({
        data: { userId, skill: "TypeScript" },
      });
      const error = await db.prisma.profileSkill
        .create({ data: { userId, skill: "typescript" } })
        .catch((e) => e);
      expectConstraintViolation(error, "uq_profile_skill_user_lower");
    });

    it("lets two members hold the same skill", async () => {
      const other = await db.prisma.user.create({
        data: { name: "Ravi", email: "ravi@example.test" },
      });
      await db.prisma.profile.create({
        data: { userId: other.id, fullName: "Ravi" },
      });
      await db.prisma.profileSkill.create({ data: { userId, skill: "Go" } });
      await db.prisma.profileSkill.create({
        data: { userId: other.id, skill: "Go" },
      });
    });

    it.each([
      ["an empty skill", "", "ck_profile_skill_length"],
      ["an over-long skill", "x".repeat(51), "ck_profile_skill_length"],
    ])("rejects %s", async (_label, skill, constraint) => {
      const error = await db.prisma.profileSkill
        .create({ data: { userId, skill } })
        .catch((e) => e);
      expectConstraintViolation(error, constraint);
    });
  });

  describe("profile_link", () => {
    it("rejects the same url twice for one member", async () => {
      const data = {
        userId,
        type: "GITHUB" as const,
        url: "https://github.com/asha",
      };
      await db.prisma.profileLink.create({ data });
      const error = await db.prisma.profileLink
        .create({ data })
        .catch((e) => e);
      expectConstraintViolation(error, "uq_profile_link_user_url");
    });

    it("rejects an over-long url", async () => {
      const error = await db.prisma.profileLink
        .create({
          data: {
            userId,
            type: "WEBSITE",
            url: `https://example.com/${"x".repeat(2040)}`,
          },
        })
        .catch((e) => e);
      expectConstraintViolation(error, "ck_profile_link_url_length");
    });
  });

  it("deletes every detail row with the profile", async () => {
    await db.prisma.profileExperience.create({ data: experience() });
    await db.prisma.profileEducation.create({ data: education() });
    await db.prisma.profileSkill.create({ data: { userId, skill: "Go" } });
    await db.prisma.profileLink.create({
      data: { userId, type: "WEBSITE", url: "https://example.com" },
    });

    await db.prisma.profile.delete({ where: { userId } });

    expect(await db.prisma.profileExperience.count()).toBe(0);
    expect(await db.prisma.profileEducation.count()).toBe(0);
    expect(await db.prisma.profileSkill.count()).toBe(0);
    expect(await db.prisma.profileLink.count()).toBe(0);
  });
});
