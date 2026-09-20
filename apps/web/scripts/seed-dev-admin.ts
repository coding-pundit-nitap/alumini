import { hashPassword } from "better-auth/crypto";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@nitap/database";
import { seedDevAdmin } from "@nitap/database/seed";

/**
 * Development-only super admin (TASK.md Phase 1). Lives in apps/web because Better Auth's
 * password hashing does; @nitap/database only receives the finished hash. Run through
 * `pnpm db:seed`, after the database package has seeded the roles.
 */
async function main() {
  if (process.env.NODE_ENV === "production") {
    console.log("Skipping dev admin: NODE_ENV=production.");
    return;
  }
  const email = process.env.DEV_ADMIN_EMAIL;
  const password = process.env.DEV_ADMIN_PASSWORD;
  const connectionString = process.env.DATABASE_URL;
  if (!email || !password) {
    console.log(
      "Skipping dev admin: DEV_ADMIN_EMAIL / DEV_ADMIN_PASSWORD not set."
    );
    return;
  }
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  try {
    await seedDevAdmin(prisma, {
      email,
      passwordHash: await hashPassword(password),
    });
    console.log(`Dev admin ready: ${email}`);
  } finally {
    await prisma.$disconnect();
  }
}

await main();
