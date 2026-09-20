import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { expectConstraintViolation } from "../../support/constraint-test";
import type { TestDatabase } from "../../support/test-database";
import { createTestDatabase } from "../../support/test-database";

async function makeUser(db: TestDatabase, email: string) {
  return db.prisma.user.create({ data: { name: email, email } });
}

describe("RBAC tables", () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  afterEach(async () => {
    await db.drop();
  });

  it("assigns a valid role to a user", async () => {
    const admin = await makeUser(db, "admin@example.com");
    const alumnus = await makeUser(db, "alumnus@example.com");
    const role = await db.prisma.role.create({ data: { name: "ALUMNI" } });

    const assignment = await db.prisma.userRole.create({
      data: { userId: alumnus.id, roleId: role.id, grantedBy: admin.id },
    });
    expect(assignment.grantedAt).toBeTruthy();
  });

  it("rejects assigning an unknown role (user_role_role_id_fkey)", async () => {
    const admin = await makeUser(db, "admin@example.com");
    const alumnus = await makeUser(db, "alumnus@example.com");

    await expect(
      db.prisma.userRole.create({
        data: {
          userId: alumnus.id,
          roleId: crypto.randomUUID(),
          grantedBy: admin.id,
        },
      })
    ).rejects.toSatisfy((error: unknown) => {
      expectConstraintViolation(error, "user_role_role_id_fkey");
      return true;
    });
  });

  it("rejects assigning the same role twice (uq_user_role)", async () => {
    const admin = await makeUser(db, "admin@example.com");
    const alumnus = await makeUser(db, "alumnus@example.com");
    const role = await db.prisma.role.create({ data: { name: "ALUMNI" } });
    await db.prisma.userRole.create({
      data: { userId: alumnus.id, roleId: role.id, grantedBy: admin.id },
    });

    await expect(
      db.prisma.userRole.create({
        data: { userId: alumnus.id, roleId: role.id, grantedBy: admin.id },
      })
    ).rejects.toSatisfy((error: unknown) => {
      expectConstraintViolation(error, "uq_user_role");
      return true;
    });
  });

  it("rejects a duplicate (role, permission) bundle row (uq_role_permission)", async () => {
    const role = await db.prisma.role.create({ data: { name: "MODERATOR" } });
    await db.prisma.rolePermission.create({
      data: { roleId: role.id, permission: "post.moderate" },
    });

    await expect(
      db.prisma.rolePermission.create({
        data: { roleId: role.id, permission: "post.moderate" },
      })
    ).rejects.toSatisfy((error: unknown) => {
      expectConstraintViolation(error, "uq_role_permission");
      return true;
    });
  });

  it("grants a GLOBAL permission with no chapter", async () => {
    const admin = await makeUser(db, "admin@example.com");
    const coordinator = await makeUser(db, "coordinator@example.com");

    const grant = await db.prisma.permissionGrant.create({
      data: {
        userId: coordinator.id,
        permission: "alumni.verify",
        scopeType: "GLOBAL",
        grantedBy: admin.id,
      },
    });
    expect(grant.chapterId).toBeNull();
  });

  it("grants a CHAPTER-scoped permission with a chapter", async () => {
    const admin = await makeUser(db, "admin@example.com");
    const chapterAdmin = await makeUser(db, "chapter-admin@example.com");
    const chapter = await db.prisma.chapter.create({
      data: { slug: "bengaluru" },
    });

    const grant = await db.prisma.permissionGrant.create({
      data: {
        userId: chapterAdmin.id,
        permission: "event.manage",
        scopeType: "CHAPTER",
        chapterId: chapter.id,
        grantedBy: admin.id,
      },
    });
    expect(grant.chapterId).toBe(chapter.id);
  });

  it("rejects a GLOBAL grant that names a chapter (ck_grant_scope)", async () => {
    const admin = await makeUser(db, "admin@example.com");
    const target = await makeUser(db, "target@example.com");
    const chapter = await db.prisma.chapter.create({ data: { slug: "delhi" } });

    await expect(
      db.prisma.permissionGrant.create({
        data: {
          userId: target.id,
          permission: "event.manage",
          scopeType: "GLOBAL",
          chapterId: chapter.id,
          grantedBy: admin.id,
        },
      })
    ).rejects.toSatisfy((error: unknown) => {
      expectConstraintViolation(error, "ck_grant_scope");
      return true;
    });
  });

  it("rejects a CHAPTER grant with no chapter (ck_grant_scope)", async () => {
    const admin = await makeUser(db, "admin@example.com");
    const target = await makeUser(db, "target@example.com");

    await expect(
      db.prisma.permissionGrant.create({
        data: {
          userId: target.id,
          permission: "event.manage",
          scopeType: "CHAPTER",
          grantedBy: admin.id,
        },
      })
    ).rejects.toSatisfy((error: unknown) => {
      expectConstraintViolation(error, "ck_grant_scope");
      return true;
    });
  });

  it("rejects a duplicate identical grant, treating two NULL chapter_ids as the same (uq_permission_grant)", async () => {
    const admin = await makeUser(db, "admin@example.com");
    const target = await makeUser(db, "target@example.com");
    await db.prisma.permissionGrant.create({
      data: {
        userId: target.id,
        permission: "alumni.verify",
        scopeType: "GLOBAL",
        grantedBy: admin.id,
      },
    });

    await expect(
      db.prisma.permissionGrant.create({
        data: {
          userId: target.id,
          permission: "alumni.verify",
          scopeType: "GLOBAL",
          grantedBy: admin.id,
        },
      })
    ).rejects.toSatisfy((error: unknown) => {
      expectConstraintViolation(error, "uq_permission_grant");
      return true;
    });
  });

  it("cascades permission grants when their chapter is deleted", async () => {
    const admin = await makeUser(db, "admin@example.com");
    const chapterAdmin = await makeUser(db, "chapter-admin@example.com");
    const chapter = await db.prisma.chapter.create({ data: { slug: "pune" } });
    await db.prisma.permissionGrant.create({
      data: {
        userId: chapterAdmin.id,
        permission: "event.manage",
        scopeType: "CHAPTER",
        chapterId: chapter.id,
        grantedBy: admin.id,
      },
    });

    await db.prisma.chapter.delete({ where: { id: chapter.id } });
    expect(await db.prisma.permissionGrant.count()).toBe(0);
  });
});
