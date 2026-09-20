import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { expectConstraintViolation } from "../../support/constraint-test";
import type { TestDatabase } from "../../support/test-database";
import { createTestDatabase } from "../../support/test-database";

async function makeUser(db: TestDatabase, email = "karan@example.com") {
  return db.prisma.user.create({ data: { name: "Karan", email } });
}

describe("profile", () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  afterEach(async () => {
    await db.drop();
  });

  it("allows an incomplete profile (faculty/staff/pending users have no department, degree, or year)", async () => {
    const user = await makeUser(db);
    const profile = await db.prisma.profile.create({
      data: { userId: user.id, fullName: "Karan Kumar Sah" },
    });
    expect(profile.departmentId).toBeNull();
    expect(profile.degreeId).toBeNull();
    expect(profile.graduationYear).toBeNull();
    expect(profile.visibility).toBe("MEMBERS_ONLY");
  });

  it("links to a department and degree and enforces the graduation-year range (ck_profile_graduation_year)", async () => {
    const user = await makeUser(db);
    const department = await db.prisma.department.create({
      data: {
        code: "CSE",
        name: "Computer Science and Engineering",
        shortName: "CSE",
      },
    });
    const degree = await db.prisma.degree.create({
      data: {
        code: "BTECH",
        name: "Bachelor of Technology",
        level: "UNDERGRADUATE",
      },
    });

    const profile = await db.prisma.profile.create({
      data: {
        userId: user.id,
        fullName: "Karan Kumar Sah",
        departmentId: department.id,
        degreeId: degree.id,
        graduationYear: 2023,
      },
    });
    expect(profile.graduationYear).toBe(2023);

    await expect(
      db.prisma.profile.update({
        where: { userId: user.id },
        data: { graduationYear: 2009 },
      })
    ).rejects.toSatisfy((error: unknown) => {
      expectConstraintViolation(error, "ck_profile_graduation_year");
      return true;
    });

    await expect(
      db.prisma.profile.update({
        where: { userId: user.id },
        data: { graduationYear: 2101 },
      })
    ).rejects.toSatisfy((error: unknown) => {
      expectConstraintViolation(error, "ck_profile_graduation_year");
      return true;
    });
  });

  it("allows exactly one profile per user (profile primary key doubles as uq_profile_user)", async () => {
    const user = await makeUser(db);
    await db.prisma.profile.create({
      data: { userId: user.id, fullName: "Karan" },
    });
    await expect(
      db.prisma.profile.create({
        data: { userId: user.id, fullName: "Duplicate" },
      })
    ).rejects.toSatisfy((error: unknown) => {
      expectConstraintViolation(error, "profile_pkey");
      return true;
    });
  });

  it("deletes the profile when the user is deleted (cascade)", async () => {
    const user = await makeUser(db);
    await db.prisma.profile.create({
      data: { userId: user.id, fullName: "Karan" },
    });
    await db.prisma.user.delete({ where: { id: user.id } });
    expect(await db.prisma.profile.count()).toBe(0);
  });

  it("refuses to delete a department or degree still referenced by a profile (restrict)", async () => {
    const user = await makeUser(db);
    const department = await db.prisma.department.create({
      data: {
        code: "ECE",
        name: "Electronics and Communication Engineering",
        shortName: "ECE",
      },
    });
    await db.prisma.profile.create({
      data: { userId: user.id, fullName: "Karan", departmentId: department.id },
    });

    await expect(
      db.prisma.department.delete({ where: { id: department.id } })
    ).rejects.toSatisfy((error: unknown) => {
      expectConstraintViolation(error, "profile_department_id_fkey");
      return true;
    });
  });
});
