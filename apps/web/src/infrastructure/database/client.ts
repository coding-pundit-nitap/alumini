import { PrismaPg } from "@prisma/adapter-pg";

import { env } from "@/config/env";
import { PrismaClient } from "@nitap/database";

import { createTransactionRunner } from "./transaction-runner";

// Reuse one client across hot reloads in development so we don't exhaust database connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  // Prisma 7 requires a driver adapter. Pool caps and timeouts are starting points from TDS §18.1,
  // per instance (Stage 1 runs one web instance): measure under load before tuning them, and cap
  // the pool again per instance before running more than one (system-architecture §10).
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 2_000, // pool acquire
    idleTimeoutMillis: 30_000,
    statement_timeout: 5_000, // PostgreSQL statement (API)
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export const transactionRunner = createTransactionRunner(prisma);
