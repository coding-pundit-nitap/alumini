import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "@nitap/database";
import { runSeed } from "@nitap/database/seed";
import {
  createTestDatabase,
  expectConstraintViolation,
  type TestDatabase,
} from "@nitap/testing";

type Fixture = {
  applicantId: string;
  reviewerId: string;
  departmentId: string;
  degreeId: string;
};

async function fixture(prisma: PrismaClient): Promise<Fixture> {
  await runSeed(prisma);
  const [applicant, reviewer, department, degree] = await Promise.all([
    prisma.user.create({ data: { name: "Asha", email: "asha@example.test" } }),
    prisma.user.create({
      data: {
        name: "Ravi",
        email: "ravi@example.test",
        accountState: "VERIFIED",
      },
    }),
    prisma.department.findFirstOrThrow(),
    prisma.degree.findFirstOrThrow(),
  ]);
  return {
    applicantId: applicant.id,
    reviewerId: reviewer.id,
    departmentId: department.id,
    degreeId: degree.id,
  };
}

const base = (f: Fixture) => ({
  userId: f.applicantId,
  rollNumber: "NITAP-2019-042",
  departmentId: f.departmentId,
  degreeId: f.degreeId,
  graduationYear: 2019,
});

const decided = (f: Fixture) => ({
  ...base(f),
  reviewedBy: f.reviewerId,
  reviewedAt: new Date(),
});

describe("verification_request constraints (real PostgreSQL)", () => {
  let db: TestDatabase;
  let f: Fixture;

  beforeEach(async () => {
    db = await createTestDatabase();
    f = await fixture(db.prisma);
  });

  afterEach(async () => {
    await db.drop();
  });

  it("has sensible defaults", async () => {
    const row = await db.prisma.verificationRequest.create({ data: base(f) });
    expect(row).toMatchObject({
      status: "PENDING",
      crossCheck: "NOT_CHECKED",
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
    });
  });

  it.each([
    [
      "ck_verification_pending_reviewer",
      "a PENDING request with a reviewer",
      (f: Fixture) => ({ ...decided(f), status: "PENDING" as const }),
    ],
    [
      "ck_verification_pending_reviewer",
      "an APPROVED request with no reviewer",
      (f: Fixture) => ({ ...base(f), status: "APPROVED" as const }),
    ],
    [
      "ck_verification_reviewer_not_subject",
      "a request reviewed by its own applicant",
      (f: Fixture) => ({
        ...decided(f),
        reviewedBy: f.applicantId,
        status: "APPROVED" as const,
      }),
    ],
    [
      "ck_verification_reject_note",
      "a REJECTED request with no note",
      (f: Fixture) => ({ ...decided(f), status: "REJECTED" as const }),
    ],
    [
      "ck_verification_graduation_year",
      "a graduation year before 2010",
      (f: Fixture) => ({ ...base(f), graduationYear: 2009 }),
    ],
    [
      "ck_verification_graduation_year",
      "a graduation year after 2100",
      (f: Fixture) => ({ ...base(f), graduationYear: 2101 }),
    ],
    [
      "ck_verification_roll_number",
      "an empty roll number",
      (f: Fixture) => ({ ...base(f), rollNumber: "" }),
    ],
    [
      "ck_verification_roll_number",
      "a roll number over 50 characters",
      (f: Fixture) => ({ ...base(f), rollNumber: "x".repeat(51) }),
    ],
    [
      "ck_verification_supporting_info",
      "supporting information over 2000 characters",
      (f: Fixture) => ({ ...base(f), supportingInfo: "x".repeat(2001) }),
    ],
    [
      "ck_verification_review_note",
      "a review note over 1000 characters",
      (f: Fixture) => ({
        ...decided(f),
        status: "REJECTED" as const,
        reviewNote: "x".repeat(1001),
      }),
    ],
  ])("%s rejects %s", async (name, _label, build) => {
    await expect(
      db.prisma.verificationRequest.create({ data: build(f) })
    ).rejects.toSatisfy((error: unknown) => {
      expectConstraintViolation(error, name);
      return true;
    });
  });

  it("allows only one PENDING request per user", async () => {
    await db.prisma.verificationRequest.create({ data: base(f) });
    await expect(
      db.prisma.verificationRequest.create({ data: base(f) })
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("allows a new request once the previous one has been decided", async () => {
    await db.prisma.verificationRequest.create({
      data: {
        ...decided(f),
        status: "REJECTED",
        reviewNote: "Roll number not recognised.",
      },
    });
    await expect(
      db.prisma.verificationRequest.create({ data: base(f) })
    ).resolves.toMatchObject({ status: "PENDING" });
  });
});
