import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { expectConstraintViolation } from "../../support/constraint-test";
import type { TestDatabase } from "../../support/test-database";
import { createTestDatabase } from "../../support/test-database";

describe("user email (case-insensitive uniqueness)", () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  afterEach(async () => {
    await db.drop();
  });

  it("creates a user", async () => {
    const user = await db.prisma.user.create({
      data: { name: "Karan Kumar Sah", email: "karan@example.com" },
    });
    expect(user.id).toBeTruthy();
    expect(user.accountState).toBe("PENDING");
  });

  it("rejects a second account whose email differs only by case (uq_user_email_ci)", async () => {
    await db.prisma.user.create({
      data: { name: "Karan", email: "Karan@example.com" },
    });

    await expect(
      db.prisma.user.create({
        data: { name: "Impersonator", email: "karan@example.com" },
      })
    ).rejects.toSatisfy((error: unknown) => {
      expectConstraintViolation(error, "uq_user_email_ci");
      return true;
    });
  });

  it("still enforces the plain unique(email) Prisma relies on for findUnique", async () => {
    await db.prisma.user.create({
      data: { name: "Karan", email: "karan@example.com" },
    });

    await expect(
      db.prisma.user.create({
        data: { name: "Duplicate", email: "karan@example.com" },
      })
    ).rejects.toSatisfy((error: unknown) => {
      expectConstraintViolation(error, "user_email_key");
      return true;
    });
  });
});
