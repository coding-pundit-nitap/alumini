import { hashPassword } from "better-auth/crypto";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@nitap/database";
import { seedDevAdmin, seedDevCoordinator } from "@nitap/database/seed";

/**
 * Development-only accounts (TASK.md Phase 1, Phase 2D): a super admin and an alumni coordinator, each
 * seeded only when its email and password are set. Lives in apps/web because Better Auth's password
 * hashing does; @nitap/database only receives the finished hash. Run through `pnpm db:seed`, after the
 * database package has seeded the roles.
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

  const wanted = accounts.filter((a) => a.email && a.password);
  for (const a of accounts) {
    if (!(a.email && a.password)) {
      console.log(
        `Skipping dev ${a.label}: DEV_${a.label.toUpperCase()}_EMAIL / _PASSWORD not set.`
      );
    }
  }
  if (wanted.length === 0) return;
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
  } finally {
    await prisma.$disconnect();
  }
}

await main();
