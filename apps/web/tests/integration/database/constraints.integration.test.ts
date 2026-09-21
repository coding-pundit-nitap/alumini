import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  expectConstraintViolation,
  type ConstraintCase,
} from "../../support/constraint-test";
import type { TestDatabase } from "../../support/test-database";
import { createTestDatabase } from "../../support/test-database";

/**
 * Every Phase 1 constraint, by its PostgreSQL name (TASK.md "(+) constraint tests that fail when a
 * constraint is dropped"). For each one:
 *   1. violating it is rejected, and the error names exactly that constraint;
 *   2. in a scratch copy where it is dropped, the same write succeeds — proving (1) is not vacuous.
 */
const CONSTRAINT_NAMES = [
  "uq_user_email_ci",
  "user_email_key",
  "department_code_key",
  "degree_code_key",
  "chapter_slug_key",
  "ck_profile_graduation_year",
  "profile_pkey",
  "profile_department_id_fkey",
  "uq_user_role",
  "user_role_role_id_fkey",
  "uq_role_permission",
  "ck_grant_scope",
  "uq_permission_grant",
  "permission_grant_chapter_id_fkey",
] as const;

/**
 * How to drop each one. `table` is the owner for ALTER TABLE … DROP CONSTRAINT; unique indexes
 * (Prisma's `CREATE UNIQUE INDEX`, and uq_user_email_ci) are not table constraints and are dropped
 * with DROP INDEX, which runs for every name. `alsoDrop` lists constraints that overlap this one:
 * an exact-duplicate email violates both user_email_key and uq_user_email_ci, so proving that
 * user_email_key can fail means removing both.
 */
const DROP: Record<
  (typeof CONSTRAINT_NAMES)[number],
  { table?: string; alsoDrop?: string[] }
> = {
  uq_user_email_ci: {},
  user_email_key: { alsoDrop: ["uq_user_email_ci"] },
  department_code_key: {},
  degree_code_key: {},
  chapter_slug_key: {},
  ck_profile_graduation_year: { table: "profile" },
  profile_pkey: { table: "profile" },
  profile_department_id_fkey: { table: "profile" },
  uq_user_role: {},
  user_role_role_id_fkey: { table: "user_role" },
  uq_role_permission: {},
  ck_grant_scope: { table: "permission_grant" },
  uq_permission_grant: { table: "permission_grant" },
  permission_grant_chapter_id_fkey: { table: "permission_grant" },
};

async function buildCases(
  prisma: TestDatabase["prisma"]
): Promise<ConstraintCase[]> {
  const user = (email: string) =>
    prisma.user.create({ data: { name: email, email } });
  const admin = await user("constraint-admin@example.com");
  const target = await user("constraint-target@example.com");
  const department = await prisma.department.create({
    data: { code: "CST", name: "Constraint Test Dept", shortName: "CST" },
  });
  const role = await prisma.role.create({ data: { name: "CONSTRAINT_ROLE" } });
  await prisma.chapter.create({ data: { slug: "constraint-chapter" } });
  await prisma.degree.create({
    data: { code: "CDG", name: "Constraint Degree", level: "UNDERGRADUATE" },
  });
  await prisma.profile.create({
    data: {
      userId: target.id,
      fullName: "Target",
      departmentId: department.id,
      graduationYear: 2020,
    },
  });
  await prisma.userRole.create({
    data: { userId: target.id, roleId: role.id, grantedBy: admin.id },
  });
  await prisma.rolePermission.create({
    data: { roleId: role.id, permission: "profile.read" },
  });
  await prisma.permissionGrant.create({
    data: {
      userId: target.id,
      permission: "alumni.verify",
      scopeType: "GLOBAL",
      grantedBy: admin.id,
    },
  });

  const cases: Record<
    (typeof CONSTRAINT_NAMES)[number],
    ConstraintCase["violate"]
  > = {
    uq_user_email_ci: (p) =>
      p.user.create({
        data: { name: "dup", email: "Constraint-Admin@example.com" },
      }),
    user_email_key: (p) =>
      p.user.create({
        data: { name: "dup", email: "constraint-admin@example.com" },
      }),
    department_code_key: (p) =>
      p.department.create({
        data: { code: "CST", name: "dup", shortName: "dup" },
      }),
    degree_code_key: (p) =>
      p.degree.create({
        data: { code: "CDG", name: "dup", level: "POSTGRADUATE" },
      }),
    chapter_slug_key: (p) =>
      p.chapter.create({ data: { slug: "constraint-chapter" } }),
    ck_profile_graduation_year: (p) =>
      p.profile.update({
        where: { userId: target.id },
        data: { graduationYear: 1999 },
      }),
    profile_pkey: (p) =>
      p.profile.create({ data: { userId: target.id, fullName: "dup" } }),
    profile_department_id_fkey: (p) =>
      p.department.delete({ where: { id: department.id } }),
    uq_user_role: (p) =>
      p.userRole.create({
        data: { userId: target.id, roleId: role.id, grantedBy: admin.id },
      }),
    user_role_role_id_fkey: (p) =>
      p.userRole.create({
        data: {
          userId: admin.id,
          roleId: crypto.randomUUID(),
          grantedBy: admin.id,
        },
      }),
    uq_role_permission: (p) =>
      p.rolePermission.create({
        data: { roleId: role.id, permission: "profile.read" },
      }),
    ck_grant_scope: (p) =>
      p.permissionGrant.create({
        data: {
          userId: target.id,
          permission: "event.manage",
          scopeType: "CHAPTER",
          grantedBy: admin.id,
        },
      }),
    uq_permission_grant: (p) =>
      p.permissionGrant.create({
        data: {
          userId: target.id,
          permission: "alumni.verify",
          scopeType: "GLOBAL",
          grantedBy: admin.id,
        },
      }),
    permission_grant_chapter_id_fkey: (p) =>
      p.permissionGrant.create({
        data: {
          userId: target.id,
          permission: "event.manage",
          scopeType: "CHAPTER",
          chapterId: crypto.randomUUID(),
          grantedBy: admin.id,
        },
      }),
  };

  return CONSTRAINT_NAMES.map((name) => ({ name, violate: cases[name] }));
}

async function dropConstraint(prisma: TestDatabase["prisma"], name: string) {
  const { table } = DROP[name as keyof typeof DROP] ?? {};
  if (table) {
    // CASCADE: profile_pkey is referenced by the Phase 3B detail tables' foreign keys. This runs in a
    // disposable per-test database, and the test only proves the violation goes through once dropped.
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${name}" CASCADE`
    );
  }
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "${name}"`);
}

describe("every Phase 1 constraint", () => {
  let db: TestDatabase;
  let cases: ConstraintCase[];

  beforeEach(async () => {
    db = await createTestDatabase();
    cases = await buildCases(db.prisma);
  });

  afterEach(async () => {
    await db.drop();
  });

  it("has a case for every constraint name, and no others", () => {
    expect(cases.map((c) => c.name)).toEqual([...CONSTRAINT_NAMES]);
  });

  it.each(CONSTRAINT_NAMES)("%s is enforced, by name", async (name) => {
    const { violate } = cases.find((c) => c.name === name)!;

    await expect(violate(db.prisma)).rejects.toSatisfy((error: unknown) => {
      expectConstraintViolation(error, name);
      return true;
    });
  });

  it.each(CONSTRAINT_NAMES)(
    "%s can fail: dropping it lets the violation through",
    async (name) => {
      const { violate } = cases.find((c) => c.name === name)!;

      for (const dropped of [name, ...(DROP[name].alsoDrop ?? [])]) {
        await dropConstraint(db.prisma, dropped);
      }

      await expect(violate(db.prisma)).resolves.toBeDefined();
    }
  );
});
