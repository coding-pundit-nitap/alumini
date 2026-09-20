import { defineConfig } from "vitest/config";

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
          include: ["tests/**/*.integration.test.ts"],
          testTimeout: 30_000,
          globalSetup: ["./tests/global-setup.ts"],
        },
      },
    ],
  },
});
