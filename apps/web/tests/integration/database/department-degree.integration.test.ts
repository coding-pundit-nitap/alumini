import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { expectConstraintViolation } from "../../support/constraint-test";
import type { TestDatabase } from "../../support/test-database";
import { createTestDatabase } from "../../support/test-database";

describe("department and degree (reference tables, D2)", () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  afterEach(async () => {
    await db.drop();
  });

  it("creates a department and a degree", async () => {
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
    expect(department.isActive).toBe(true);
    expect(degree.level).toBe("UNDERGRADUATE");
  });

  it("rejects a duplicate department code (department_code_key)", async () => {
    await db.prisma.department.create({
      data: {
        code: "CSE",
        name: "Computer Science and Engineering",
        shortName: "CSE",
      },
    });
    await expect(
      db.prisma.department.create({
        data: { code: "CSE", name: "Duplicate", shortName: "Dup" },
      })
    ).rejects.toSatisfy((error: unknown) => {
      expectConstraintViolation(error, "department_code_key");
      return true;
    });
  });

  it("rejects a duplicate degree code (degree_code_key)", async () => {
    await db.prisma.degree.create({
      data: {
        code: "BTECH",
        name: "Bachelor of Technology",
        level: "UNDERGRADUATE",
      },
    });
    await expect(
      db.prisma.degree.create({
        data: { code: "BTECH", name: "Duplicate", level: "POSTGRADUATE" },
      })
    ).rejects.toSatisfy((error: unknown) => {
      expectConstraintViolation(error, "degree_code_key");
      return true;
    });
  });

  it("rejects an invalid degree level (enum)", async () => {
    await expect(
      db.prisma.degree.create({
        data: {
          code: "DIPLOMA",
          name: "Diploma",
          // @ts-expect-error — proving the database rejects a value outside the enum, not just TypeScript
          level: "DIPLOMA",
        },
      })
    ).rejects.toThrow();
  });
});
