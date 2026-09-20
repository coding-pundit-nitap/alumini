import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client.ts";
import { DEGREES, DEPARTMENTS } from "./seed-data/reference-data.ts";
import { ROLE_NAMES, ROLE_PERMISSIONS } from "./seed-data/role-permissions.ts";

export type DevAdmin = {
  email: string;
  /** Already hashed by the caller (Better Auth's hashPassword); this package never sees plaintext. */
  passwordHash: string;
};

/**
 * Roles, role→permission bundles, departments and degrees. Safe in every environment.
 * Idempotent: every write is an upsert on a natural key, so running it twice changes no rows
 * (TASK.md Phase 1 "(+) the seed is idempotent").
 */
export async function runSeed(prisma: PrismaClient): Promise<void> {
  for (const name of ROLE_NAMES) {
    await prisma.role.upsert({ where: { name }, create: { name }, update: {} });
  }

  for (const [roleName, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: roleName },
    });
    for (const permission of permissions) {
      await prisma.rolePermission.upsert({
        where: { roleId_permission: { roleId: role.id, permission } },
        create: { roleId: role.id, permission },
        update: {},
      });
    }
  }

  // Reference rows are only written when a value differs: @updatedAt would otherwise change
  // on every run, and "idempotent" means no row changes at all.
  for (const department of DEPARTMENTS) {
    const existing = await prisma.department.findUnique({
      where: { code: department.code },
    });
    if (!existing) {
      await prisma.department.create({ data: department });
    } else if (
      existing.name !== department.name ||
      existing.shortName !== department.shortName
    ) {
      await prisma.department.update({
        where: { code: department.code },
        data: { name: department.name, shortName: department.shortName },
      });
    }
  }

  for (const degree of DEGREES) {
    const existing = await prisma.degree.findUnique({
      where: { code: degree.code },
    });
    if (!existing) {
      await prisma.degree.create({ data: degree });
    } else if (
      existing.name !== degree.name ||
      existing.level !== degree.level
    ) {
      await prisma.degree.update({
        where: { code: degree.code },
        data: { name: degree.name, level: degree.level },
      });
    }
  }
}

/**
 * Development-only super admin. Requires runSeed to have created the SUPER_ADMIN role.
 * The password hash comes from the caller: hashing lives with Better Auth in apps/web, so this
 * package needs no dependency on it, and the caller decides whether the environment allows it.
 */
export async function seedDevAdmin(
  prisma: PrismaClient,
  admin: DevAdmin
): Promise<void> {
  const superAdminRole = await prisma.role.findUniqueOrThrow({
    where: { name: "SUPER_ADMIN" },
  });
  const user = await prisma.user.upsert({
    where: { email: admin.email },
    create: {
      name: "Dev Super Admin",
      email: admin.email,
      emailVerified: true,
      accountState: "VERIFIED",
    },
    update: {},
  });
  await prisma.account.upsert({
    where: {
      providerId_accountId: { providerId: "credential", accountId: user.id },
    },
    create: {
      providerId: "credential",
      accountId: user.id,
      userId: user.id,
      password: admin.passwordHash,
    },
    // Never overwrite an existing hash on re-seed.
    update: {},
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: superAdminRole.id } },
    create: { userId: user.id, roleId: superAdminRole.id, grantedBy: user.id },
    update: {},
  });
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  try {
    await runSeed(prisma);
    console.log("Seed complete: roles, RBAC bundles, departments, degrees.");
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
