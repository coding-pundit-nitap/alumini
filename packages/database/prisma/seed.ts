import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client.ts";
import { DEGREES, DEPARTMENTS } from "./seed-data/reference-data.ts";
import { RETENTION_CATALOGUE } from "./seed-data/retention.ts";
import {
  ROLE_NAMES,
  ROLE_PERMISSIONS,
  type RoleName,
} from "./seed-data/role-permissions.ts";

export type DevAdmin = {
  email: string;
  /** Already hashed by the caller (Better Auth's hashPassword); this package never sees plaintext. */
  passwordHash: string;
};

/**
 * Roles, role→permission bundles, departments and degrees. Safe in every environment.
 * Idempotent: every write is an upsert on a natural key, so running it twice changes no rows
 *.
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

  // Placeholders: insert missing categories only, never overwrite an admin's edit.
  for (const [category, { defaultDays }] of Object.entries(
    RETENTION_CATALOGUE
  )) {
    await prisma.retentionSetting.upsert({
      where: { category },
      create: { category, retentionDays: defaultDays },
      update: {},
    });
  }
}

export type SeedUser = {
  email: string;
  name: string;
  roleName: RoleName;
  /** Already hashed by the caller (Better Auth's hashPassword); this package never sees plaintext. */
  passwordHash: string;
};

/**
 * A verified user with a credential, a profile and one role, granted by the user themselves (the
 * bootstrap convention: nobody exists yet to grant it). Idempotent, and never overwrites an existing
 * password hash. Requires runSeed to have created the roles.
 */
export async function seedAdminUser(
  prisma: PrismaClient,
  seedUser: SeedUser
): Promise<void> {
  const role = await prisma.role.findUniqueOrThrow({
    where: { name: seedUser.roleName },
  });
  const user = await prisma.user.upsert({
    where: { email: seedUser.email },
    create: {
      name: seedUser.name,
      email: seedUser.email,
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
      password: seedUser.passwordHash,
    },
    // Never overwrite an existing hash on re-seed.
    update: {},
  });
  await prisma.profile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, fullName: seedUser.name },
    update: {},
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    create: { userId: user.id, roleId: role.id, grantedBy: user.id },
    update: {},
  });
}

/**
 * Development-only super admin. The password hash comes from the caller: hashing lives with Better
 * Auth in apps/web, so this package needs no dependency on it, and the caller decides whether the
 * environment allows it.
 */
export async function seedDevAdmin(
  prisma: PrismaClient,
  admin: DevAdmin
): Promise<void> {
  await seedAdminUser(prisma, {
    email: admin.email,
    name: "Dev Super Admin",
    roleName: "SUPER_ADMIN",
    passwordHash: admin.passwordHash,
  });
}

/** Development-only alumni coordinator: the reviewer for verification requests in local runs and E2E. */
export async function seedDevCoordinator(
  prisma: PrismaClient,
  admin: DevAdmin
): Promise<void> {
  await seedAdminUser(prisma, {
    email: admin.email,
    name: "Dev Coordinator",
    roleName: "ALUMNI_COORDINATOR",
    passwordHash: admin.passwordHash,
  });
}

/** A super admin already exists, so bootstrapping another is refused. */
export class BootstrapRefusedError extends Error {
  constructor() {
    super("A super admin already exists; refusing to create another.");
    this.name = "BootstrapRefusedError";
  }
}

/**
 * Creates the FIRST super admin of an environment, in any environment. Refuses when one exists, so it
 * cannot be used to mint a second. (Two operators running it at the very same instant with different
 * emails could both pass the check; it is a manual, one-time operation.)
 */
export async function bootstrapSuperAdmin(
  prisma: PrismaClient,
  admin: DevAdmin & { name?: string }
): Promise<void> {
  const existing = await prisma.userRole.count({
    where: { role: { name: "SUPER_ADMIN" } },
  });
  if (existing > 0) throw new BootstrapRefusedError();
  await seedAdminUser(prisma, {
    email: admin.email,
    name: admin.name ?? "Super Admin",
    roleName: "SUPER_ADMIN",
    passwordHash: admin.passwordHash,
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
    console.log(
      "Seed complete: roles, RBAC bundles, departments, degrees, retention settings."
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
