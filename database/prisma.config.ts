import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// One .env at the repository root serves the whole workspace; Prisma runs with cwd = database/.
config({ path: "../.env", quiet: true });

// Prisma 7 does not read .env or the datasource url from schema.prisma; both live here.
//
// `prisma generate` never connects to the database, but env() throws when the variable is
// unset, which would break `postinstall`, CI and typecheck on machines without a database.
// So generate gets a placeholder; every command that does touch the database (migrate, db,
// studio) still fails loudly if DATABASE_URL is missing.
const isGenerate = process.argv.includes("generate");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: isGenerate
      ? (process.env.DATABASE_URL ??
        "postgresql://placeholder:placeholder@localhost:5432/placeholder")
      : env("DATABASE_URL"),
  },
});
