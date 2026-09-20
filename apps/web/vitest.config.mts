import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// The file suffix is the classifier (strategy §5.5):
//   *.test.ts             unit (node)
//   *.test.tsx, *.dom.test.ts, src/hooks/**  dom (happy-dom)
//   *.integration.test.ts integration (node, real Postgres/Redis)
//   *.contract.test.ts    contract (node, real Postgres/Redis)
export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    restoreMocks: true,
    // Integration and contract projects are empty until Phase 1; an empty project must not fail the run.
    passWithNoTests: true,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: [
            "src/**/*.test.ts",
            "tests/architecture/**/*.test.ts",
            // @nitap/database's own vitest install can't be resolved in this environment's
            // sandboxed pnpm (vitest requires the `vite` peer, and pnpm's release-age policy
            // blocks materializing a fresh peer-qualified variant for that package alone — see
            // database/package.json's `test` script comment). Run its pure, DB-free unit tests
            // through this already-working install instead; `database/` still owns the files.
            "../../database/prisma/seed-data/**/*.test.ts",
          ],
          exclude: [
            "node_modules",
            ".next/**",
            "**/*.{dom,integration,contract}.test.ts",
            "src/hooks/**",
            "src/components/**",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "happy-dom",
          setupFiles: ["./tests/support/setup.dom.ts"],
          include: [
            "src/**/*.test.tsx",
            "src/**/*.dom.test.ts",
            "src/hooks/**/*.test.ts",
          ],
          exclude: ["node_modules", ".next/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          globalSetup: ["./tests/support/global-setup.ts"],
          include: [
            "src/**/*.integration.test.ts",
            "tests/integration/**/*.integration.test.ts",
          ],
          testTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          name: "contract",
          environment: "node",
          globalSetup: ["./tests/support/global-setup.ts"],
          include: ["src/**/*.contract.test.ts"],
          testTimeout: 30_000,
        },
      },
    ],
  },
});
