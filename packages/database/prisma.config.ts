import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// One .env at the repository root serves the whole workspace; Prisma runs with cwd = packages/database/.
config({ path: "../../.env", quiet: true });

// Prisma 7 reads the datasource url here, not from schema.prisma. `generate` gets a placeholder so it
// works without DATABASE_URL; commands that connect still fail loudly when it is missing.
const isGenerate = process.argv.includes("generate");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // Reference data and RBAC only; the dev admin needs Better Auth's hashing, so it is seeded
    // separately by `pnpm db:seed` from the repo root.
    seed: "node prisma/seed.ts",
  },
  datasource: {
    url: isGenerate
      ? (process.env.DATABASE_URL ??
        "postgresql://placeholder:placeholder@localhost:5432/placeholder")
      : env("DATABASE_URL"),
    // Only `migrate diff --from-migrations` needs it (pnpm db:drift, which sets it). `migrate dev`
    // creates and drops its own shadow database when this is unset.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
