import { afterEach, beforeEach, describe, it } from "vitest";

import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { expectConstraintViolation } from "../../support/constraint-test";

describe("mentor_profile constraints", () => {
  let db: TestDatabase;
  let userId: string;
  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    userId = (
      await db.prisma.user.create({
        data: { name: "M", email: "m@example.test", accountState: "VERIFIED" },
      })
    ).id;
  });
  afterEach(async () => {
    await db.drop();
  });

  const ok = { expertise: "Distributed systems" };
  const cases: [string, Record<string, unknown>][] = [
    ["ck_mentor_max", { ...ok, maxMentees: 0 }],
    ["ck_mentor_max", { ...ok, maxMentees: 21 }],
    ["ck_mentor_expertise", { expertise: "" }],
    ["ck_mentor_expertise", { expertise: "x".repeat(1001) }],
    ["ck_mentor_availability", { ...ok, availability: "x".repeat(201) }],
    [
      "ck_mentor_topics",
      { ...ok, topics: Array.from({ length: 11 }, (_, i) => `t${i}`) },
    ],
  ];

  it.each(cases)("%s rejects %j", async (name, data) => {
    const error = await db.prisma.mentorProfile
      .create({ data: { userId, ...data } as never })
      .then(
        () => null,
        (e: unknown) => e
      );
    expectConstraintViolation(error, name);
  });

  it("accepts a valid row with defaults (max 3, accepting, IN_APP)", async () => {
    const row = await db.prisma.mentorProfile.create({
      data: { userId, ...ok },
    });
    if (
      row.maxMentees !== 3 ||
      !row.accepting ||
      row.preferredContactMethod !== "IN_APP"
    ) {
      throw new Error("defaults wrong");
    }
  });
});
