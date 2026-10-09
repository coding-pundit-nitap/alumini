import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { PrismaClient } from "@nitap/database";

/** The pool is returned too so `/metrics` can report it. */
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
    // A stalled server never reaches statement_timeout; this bounds the wait on the client.
    query_timeout: 35_000,
  });
  return { prisma: new PrismaClient({ adapter: new PrismaPg(pool) }), pool };
}
