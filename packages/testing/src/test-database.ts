import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { inject } from "vitest";

// Declared here, not in global-setup.ts: this is where `inject` is actually called, and a program that
// only pulls in this file (e.g. another package's tsc run over workspace source) still sees the
// augmentation. Duplicating it in global-setup.ts would conflict.
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
 * Clones the migrated template database into a fresh, isolated database for one
 * test (or one test file). PostgreSQL forbids `CREATE DATABASE … TEMPLATE` while any other
 * session holds a connection to the template, but the template itself is never connected to
 * after `global-setup.ts` migrates it, so this is safe to call concurrently across test files.
 */
export async function createTestDatabase(
  options: {
    /** A name chosen in advance, for code that reads the database URL at import time (see `testDatabaseName`). */
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
