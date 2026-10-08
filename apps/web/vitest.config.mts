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
    // `import "server-only"` guards client bundles at `next build`; under Vitest it is a no-op (spec 16 16E).
    alias: {
      "server-only": new URL(
        "./tests/support/server-only-stub.ts",
        import.meta.url
      ).pathname,
    },
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
            "tests/security/**/*.test.ts",
            // @nitap/database's own vitest install can't be resolved in this environment's
            // sandboxed pnpm (vitest requires the `vite` peer, and pnpm's release-age policy
            // blocks materializing a fresh peer-qualified variant for that package alone — see
            // packages/database/package.json's `test` script comment). Run its pure, DB-free unit tests
            // through this already-working install instead; `packages/database/` still owns the files.
            "../../packages/database/prisma/seed-data/**/*.test.ts",
            "../../packages/database/perf/**/*.test.ts",
            // Runs a store's contract suite against an in-memory fake (no database): the suite itself
            // (mentorship-store.contract.ts) is shared with the real store's own *.contract.test.ts
            // under src, which the "contract" project below runs against Postgres instead.
            "tests/support/fake-*.contract.test.ts",
          ],
          exclude: [
            "node_modules",
            ".next/**",
            "src/**/*.{dom,integration,contract}.test.ts",
            "src/hooks/**",
            // Real-Postgres security suites under tests/security use the *.integration.test.ts
            // suffix like everywhere else; they run in the "integration" project below, which has
            // the globalSetup that provisions the template database.
            "tests/security/**/*.integration.test.ts",
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
            "tests/security/**/*.integration.test.ts",
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
