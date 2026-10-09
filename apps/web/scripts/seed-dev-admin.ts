import { hashPassword } from "better-auth/crypto";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@nitap/database";
import { ROLE_NAMES } from "@nitap/database/role-permissions";
import {
  seedAdminUser,
  seedDevAdmin,
  seedDevCoordinator,
} from "@nitap/database/seed";

/**
 * Development accounts: a super admin, an alumni coordinator and, with DEV_ROLES_PASSWORD set,
 * one `dev-<role>@example.test` account per role. Run through `pnpm db:seed`.
 */
async function main() {
  if (process.env.NODE_ENV === "production") {
    console.log("Skipping dev accounts: NODE_ENV=production.");
    return;
  }
  const connectionString = process.env.DATABASE_URL;
  const accounts = [
    {
      label: "admin",
      email: process.env.DEV_ADMIN_EMAIL,
      password: process.env.DEV_ADMIN_PASSWORD,
      seed: seedDevAdmin,
    },
    {
      label: "coordinator",
      email: process.env.DEV_COORDINATOR_EMAIL,
      password: process.env.DEV_COORDINATOR_PASSWORD,
      seed: seedDevCoordinator,
    },
  ] as const;

  const rolesPassword = process.env.DEV_ROLES_PASSWORD;
  if (!rolesPassword) {
    console.log("Skipping per-role dev accounts: DEV_ROLES_PASSWORD not set.");
  }

  const wanted = accounts.filter((a) => a.email && a.password);
  for (const a of accounts) {
    if (!(a.email && a.password)) {
      console.log(
        `Skipping dev ${a.label}: DEV_${a.label.toUpperCase()}_EMAIL / _PASSWORD not set.`
      );
    }
  }
  if (wanted.length === 0 && !rolesPassword) return;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  try {
    for (const a of wanted) {
      await a.seed(prisma, {
        email: a.email!,
        passwordHash: await hashPassword(a.password!),
      });
      console.log(`Dev ${a.label} ready: ${a.email}`);
    }
    if (rolesPassword) {
      const passwordHash = await hashPassword(rolesPassword);
      for (const roleName of ROLE_NAMES) {
        const slug = roleName.toLowerCase().replaceAll("_", "-");
        const email = `dev-${slug}@example.test`;
        await seedAdminUser(prisma, {
          email,
          name: `Dev ${slug.replaceAll("-", " ")}`,
          roleName,
          passwordHash,
        });
        console.log(`Dev ${roleName} ready: ${email}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

await main();
