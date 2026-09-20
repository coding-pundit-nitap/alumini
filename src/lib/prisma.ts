import { PrismaPg } from "@prisma/adapter-pg";

import { env } from "@/config/env";
import { PrismaClient } from "@/generated/prisma/client";

// Reuse one client across hot reloads in development so we don't exhaust database connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  // Prisma 7 requires a driver adapter. Pool size is left at the pg default for now; cap it per
  // instance before running more than one web instance (docs/system-architecture.md §10).
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
