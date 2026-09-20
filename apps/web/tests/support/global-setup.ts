import { execFileSync } from "node:child_process";
import path from "node:path";

import type { TestProject } from "vitest/node";

/**
 * Global setup for the `integration` and `contract` projects.
 *
 * These projects run against a real PostgreSQL and Redis (strategy §6.2). Fail fast with an
 * actionable message instead of letting every test time out on a refused connection.
 *
 * PostgreSQL: migrates ONE template database (`<db>_template`) here, once, then every test file
 * clones it with `CREATE DATABASE … TEMPLATE` (strategy §6.3) via `test-database.ts`. The
 * template's connection string is published to test files with `provide`/`inject`.
 */

const TEMPLATE_SUFFIX = "_template";

function toTemplateUrl(databaseUrl: string): {
  adminUrl: string;
  templateUrl: string;
  templateName: string;
} {
  const url = new URL(databaseUrl);
  const baseName = url.pathname.slice(1);
  const templateName = `${baseName}${TEMPLATE_SUFFIX}`;

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

export default async function setup(project: TestProject) {
  const missing = ["DATABASE_URL", "REDIS_URL"].filter(
    (name) => !process.env[name]
  );
  if (missing.length > 0) {
    throw new Error(
      `Integration tests need ${missing.join(", ")}. Run \`pnpm docker:up\` and copy .env.example to .env.`
    );
  }

  const databaseUrl = process.env.DATABASE_URL!;
  const { adminUrl, templateUrl, templateName } = toTemplateUrl(databaseUrl);

  const { Client } = await import("pg");
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${templateName}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${templateName}"`);
  } finally {
    await admin.end();
  }

  // Apply every migration to the template. Runs from database/ so prisma.config.ts's relative
  // .env load and schema path resolve; DATABASE_URL is overridden for this one call.
  execFileSync(
    "pnpm",
    ["--filter", "@nitap/database", "exec", "prisma", "migrate", "deploy"],
    {
      cwd: path.resolve(__dirname, "../../../.."),
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

declare module "vitest" {
  export interface ProvidedContext {
    templateDatabaseUrl: string;
  }
}
