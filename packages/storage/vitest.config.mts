import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

// One .env at the repository root serves the workspace. Values already set in the environment win.
const rootEnv = path.resolve(import.meta.dirname, "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.integration.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["src/**/*.integration.test.ts"],
          testTimeout: 30_000,
          globalSetup: ["./tests/global-setup.ts"],
        },
      },
    ],
  },
});
