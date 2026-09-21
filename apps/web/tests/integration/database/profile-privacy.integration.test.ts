import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runSeed } from "@nitap/database/seed";
import {
  createTestDatabase,
  expectConstraintViolation,
  type TestDatabase,
} from "@nitap/testing";

describe("profile privacy and length constraints (real PostgreSQL)", () => {
  let db: TestDatabase;
  let userId: string;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    const user = await db.prisma.user.create({
      data: { name: "Asha", email: "asha@example.test" },
    });
    userId = user.id;
    await db.prisma.profile.create({
      data: { userId, fullName: "Asha", visibility: "MEMBERS_ONLY" },
    });
  });

  afterEach(async () => {
    await db.drop();
  });

  const update = (data: Record<string, unknown>) =>
    db.prisma.profile.update({ where: { userId }, data });

  it.each([
    ["contactVisibility", "ck_profile_contact_visibility"],
    ["locationVisibility", "ck_profile_location_visibility"],
    ["experienceVisibility", "ck_profile_experience_visibility"],
    ["educationVisibility", "ck_profile_education_visibility"],
  ] as const)(
    "rejects a %s looser than the profile level",
    async (column, constraint) => {
      const error = await update({ [column]: "PUBLIC" }).catch((e) => e);
      expectConstraintViolation(error, constraint);
    }
  );

  it("accepts an override equal to or stricter than the profile level, and NULL", async () => {
    await update({ locationVisibility: "MEMBERS_ONLY" });
    await update({ locationVisibility: "PRIVATE" });
    await update({ locationVisibility: null });
  });

  it("rejects tightening the profile level below an existing override", async () => {
    await update({ visibility: "PUBLIC", locationVisibility: "MEMBERS_ONLY" });
    const error = await update({ visibility: "PRIVATE" }).catch((e) => e);
    expectConstraintViolation(error, "ck_profile_location_visibility");
  });

  it.each([
    ["fullName", "", "ck_profile_full_name_length"],
    ["fullName", "x".repeat(101), "ck_profile_full_name_length"],
    ["headline", "x".repeat(121), "ck_profile_headline_length"],
    ["bio", "x".repeat(2001), "ck_profile_bio_length"],
    ["location", "x".repeat(101), "ck_profile_location_length"],
  ] as const)(
    "rejects %s of the wrong length",
    async (column, value, constraint) => {
      const error = await update({ [column]: value }).catch((e) => e);
      expectConstraintViolation(error, constraint);
    }
  );

  it("accepts values at exactly the limits", async () => {
    await update({
      fullName: "x".repeat(100),
      headline: "x".repeat(120),
      bio: "x".repeat(2000),
      location: "x".repeat(100),
    });
  });
});
