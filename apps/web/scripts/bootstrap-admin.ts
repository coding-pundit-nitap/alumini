import { hashPassword } from "better-auth/crypto";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@nitap/database";
import {
  BootstrapRefusedError,
  bootstrapSuperAdmin,
} from "@nitap/database/seed";

/** Creates the first super admin (`pnpm admin:bootstrap`). Refuses if one already exists. */
async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const connectionString = process.env.DATABASE_URL;

  if (!email || !password) {
    console.error("Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD.");
    process.exitCode = 1;
    return;
  }
  if (password.length < 12) {
    console.error("BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters.");
    process.exitCode = 1;
    return;
  }
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  try {
    await bootstrapSuperAdmin(prisma, {
      email,
      passwordHash: await hashPassword(password),
    });
    console.log(`Super admin created: ${email}`);
    console.log(
      "Sign in, change the password, and remove BOOTSTRAP_ADMIN_* from the environment."
    );
  } catch (error) {
    if (error instanceof BootstrapRefusedError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

await main();
