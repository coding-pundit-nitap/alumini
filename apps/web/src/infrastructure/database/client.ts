import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { env } from "@/config/env";
import { PrismaClient } from "@nitap/database";

import { createTransactionRunner } from "./transaction-runner";

// Reuse one client across hot reloads in development so we don't exhaust database connections.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pool?: Pool;
};

function createPool() {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  // Prisma 7 requires a driver adapter. Pool caps and timeouts are starting points from TDS §18.1,
  // per instance (Stage 1 runs one web instance): measure under load before tuning them, and cap
  // the pool again per instance before running more than one (system-architecture §10).
  return new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 2_000, // pool acquire
    idleTimeoutMillis: 30_000,
    statement_timeout: 5_000, // PostgreSQL statement (API)
    // Client-side bound for a server that stops answering (a stall never reaches statement_timeout). Without
    // it a query on an established connection waits forever (spec 14 F-5). Just above statement_timeout, so
    // a merely slow query still gets the server's own, clearer error first.
    query_timeout: 6_000,
  });
}

export const pool = globalForPrisma.pool ?? createPool();
export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter: new PrismaPg(pool) });

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.pool = pool;
}

export const transactionRunner = createTransactionRunner(prisma);
