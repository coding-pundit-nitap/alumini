import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { inject } from "vitest";

import { PrismaClient } from "@nitap/database";
import { PrismaPg } from "@prisma/adapter-pg";

export type TestDatabase = {
  databaseUrl: string;
  prisma: PrismaClient;
  drop: () => Promise<void>;
};

/**
 * Clones the migrated template database (strategy §6.3) into a fresh, isolated database for one
 * test (or one test file). PostgreSQL forbids `CREATE DATABASE … TEMPLATE` while any other
 * session holds a connection to the template, but the template itself is never connected to
 * after `global-setup.ts` migrates it, so this is safe to call concurrently across test files.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const templateUrl = inject("templateDatabaseUrl");
  const template = new URL(templateUrl);
  const templateName = template.pathname.slice(1);
  const testName = `test_${randomUUID().replace(/-/g, "")}`;

  const adminUrl = new URL(templateUrl);
  adminUrl.pathname = "/postgres";

  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${testName}" TEMPLATE "${templateName}"`);
  await admin.end();

  const testUrl = new URL(templateUrl);
  testUrl.pathname = `/${testName}`;
  const databaseUrl = testUrl.toString();

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  return {
    databaseUrl,
    prisma,
    drop: async () => {
      await prisma.$disconnect();
      const dropClient = new Client({ connectionString: adminUrl.toString() });
      await dropClient.connect();
      await dropClient.query(
        `DROP DATABASE IF EXISTS "${testName}" WITH (FORCE)`
      );
      await dropClient.end();
    },
  };
}
