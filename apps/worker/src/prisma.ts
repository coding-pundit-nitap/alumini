import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@nitap/database";

/** Pool and timeouts are the worker starting points from TDS §18.1; the relay holds one connection per poll. */
export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      max: 5,
      connectionTimeoutMillis: 2_000,
      idleTimeoutMillis: 30_000,
      statement_timeout: 30_000,
    }),
  });
}
