import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { inject } from "vitest";

// Declared where `inject` is called so programs importing only this file still see it.
declare module "vitest" {
  export interface ProvidedContext {
    templateDatabaseUrl: string;
  }
}

import { PrismaClient } from "@nitap/database";
import { PrismaPg } from "@prisma/adapter-pg";

export type TestDatabase = {
  databaseUrl: string;
  prisma: PrismaClient;
  drop: () => Promise<void>;
};

/** A fresh, unique test database name, for `createTestDatabase({ name })`. */
export function testDatabaseName(): string {
  return `test_${randomUUID().replace(/-/g, "")}`;
}

/**
 * Clones the migrated template. Safe concurrently, since nothing connects to
 * the template after setup.
 */
export async function createTestDatabase(
  options: {
    /**
     * A name chosen in advance, for code that reads the database URL at import
     * time (see `testDatabaseName`).
     */
    name?: string;
  } = {}
): Promise<TestDatabase> {
  const templateUrl = inject("templateDatabaseUrl");
  const template = new URL(templateUrl);
  const templateName = template.pathname.slice(1);
  const testName = options.name ?? testDatabaseName();

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
