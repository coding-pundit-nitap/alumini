import { execFileSync } from "node:child_process";
import path from "node:path";

import type { TestProject } from "vitest/node";

/**
 * Fails fast if PostgreSQL or Redis is unreachable. Migrates one template database that each test
 * file clones (see test-database.ts).
 */

// Safety rail: this setup creates and force-drops databases, so it only ever runs
// against a local PostgreSQL. `postgres` is the compose service name.
const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "postgres"]);

function assertLocalDatabase(databaseUrl: string) {
  const { hostname } = new URL(databaseUrl);
  if (!ALLOWED_HOSTS.has(hostname)) {
    throw new Error(
      `Refusing to run integration tests against database host "${hostname}": they create and drop databases. Allowed hosts: ${[...ALLOWED_HOSTS].join(", ")}.`
    );
  }
}

function toTemplateUrl(
  databaseUrl: string,
  suiteName: string
): {
  adminUrl: string;
  templateUrl: string;
  templateName: string;
} {
  const url = new URL(databaseUrl);
  const baseName = url.pathname.slice(1);
  const templateName = `${baseName}_template_${suiteName}`;

  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/postgres";

  const templateUrl = new URL(databaseUrl);
  templateUrl.pathname = `/${templateName}`;

  return {
    adminUrl: adminUrl.toString(),
    templateUrl: templateUrl.toString(),
    templateName,
  };
}

export type TemplateDatabaseOptions = {
  /** Per-suite template name so parallel suites never drop each other's. */
  name: string;
  /** Environment variables the suite cannot run without (fail fast with an actionable message). */
  requiredEnv: readonly string[];
};

export async function provideTemplateDatabase(
  project: TestProject,
  options: TemplateDatabaseOptions
) {
  const missing = options.requiredEnv.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Integration tests need ${missing.join(", ")}. Run \`pnpm docker:up\` and copy .env.example to .env.`
    );
  }

  const databaseUrl = process.env.DATABASE_URL!;
  assertLocalDatabase(databaseUrl);
  const { adminUrl, templateUrl, templateName } = toTemplateUrl(
    databaseUrl,
    options.name
  );

  const { Client } = await import("pg");
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${templateName}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${templateName}"`);
  } finally {
    await admin.end();
  }

  // Runs from packages/database/ so prisma.config.ts's relative paths resolve; DATABASE_URL is
  // overridden for this call.
  execFileSync(
    "pnpm",
    ["--filter", "@nitap/database", "exec", "prisma", "migrate", "deploy"],
    {
      cwd: path.resolve(import.meta.dirname, "../../.."),
      env: { ...process.env, DATABASE_URL: templateUrl },
      stdio: "inherit",
    }
  );

  project.provide("templateDatabaseUrl", templateUrl);

  return async () => {
    const cleanup = new Client({ connectionString: adminUrl });
    await cleanup.connect();
    try {
      await cleanup.query(
        `DROP DATABASE IF EXISTS "${templateName}" WITH (FORCE)`
      );
    } finally {
      await cleanup.end();
    }
  };
}

// Also declared in test-database.ts; repeated here for programs that only import this file.
declare module "vitest" {
  export interface ProvidedContext {
    templateDatabaseUrl: string;
  }
}
