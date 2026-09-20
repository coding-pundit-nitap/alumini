import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PERMISSIONS } from "@nitap/database/permissions";
import { ROLE_NAMES } from "@nitap/database/role-permissions";
import { runSeed } from "@nitap/database/seed";

import { createAuthorization } from "@/modules/auth/application/authorize";
import { resolveActor } from "@/modules/auth/application/resolve-actor";
import { createPrismaGrantSource } from "@/modules/auth/infrastructure/prisma-grant-source";

import { readRoleMatrixFromDoc } from "../../support/rbac-matrix-doc";
import type { TestDatabase } from "../../support/test-database";
import { createTestDatabase } from "../../support/test-database";

const ALL_PERMISSIONS = Object.values(PERMISSIONS);
const expected = readRoleMatrixFromDoc();

describe("RBAC §4 matrix, end to end: doc → seed → database → GrantSource → decide (rbac §11)", () => {
  let db: TestDatabase;
  const now = () => new Date();
  const { can } = createAuthorization({ observer: { record() {} }, now });

  beforeAll(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
  });

  afterAll(async () => {
    await db.drop();
  });

  it("the doc's matrix covers exactly the permission registry", () => {
    const documented = new Set(
      ROLE_NAMES.flatMap((role) => [...expected[role]])
    );
    expect([...documented].sort()).toEqual([...ALL_PERMISSIONS].sort());
  });

  it.each(ROLE_NAMES)(
    "a VERIFIED %s holds exactly the permissions the doc grants",
    async (roleName) => {
      const granter = await db.prisma.user.create({
        data: {
          name: "granter",
          email: `granter-${roleName.toLowerCase()}@example.test`,
          accountState: "VERIFIED",
        },
      });
      const user = await db.prisma.user.create({
        data: {
          name: roleName,
          email: `${roleName.toLowerCase()}@example.test`,
          accountState: "VERIFIED",
        },
      });
      const role = await db.prisma.role.findUniqueOrThrow({
        where: { name: roleName },
      });
      await db.prisma.userRole.create({
        data: { userId: user.id, roleId: role.id, grantedBy: granter.id },
      });

      const actor = await resolveActor(
        { grantSource: createPrismaGrantSource(db.prisma), now },
        { userId: user.id, accountState: "VERIFIED" },
        "req-matrix"
      );

      const allowed = new Set(ALL_PERMISSIONS.filter((p) => can(actor, p)));
      expect(allowed).toEqual(expected[roleName]);
    }
  );
});
