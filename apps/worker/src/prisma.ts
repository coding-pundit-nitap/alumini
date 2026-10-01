import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { PrismaClient } from "@nitap/database";

/**
 * Pool and timeouts are the worker starting points from TDS §18.1; the relay holds one connection per poll.
 * The pool is returned too so `/metrics` can report its usage (spec 13A A-10).
 */
export function createPrismaClient(connectionString: string): {
  prisma: PrismaClient;
  pool: Pool;
} {
  const pool = new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 2_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 30_000,
  });
  return { prisma: new PrismaClient({ adapter: new PrismaPg(pool) }), pool };
}
