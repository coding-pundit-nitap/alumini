import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  // CI prints progress and annotates failures; the html report alone writes nothing to the log.
  reporter: process.env.CI
    ? [["list"], ["github"], ["html", { open: "never" }]]
    : "html",
  // Ends a CI shard before the job's 20-minute timeout, so it fails with a report instead of being cancelled.
  globalTimeout: process.env.CI ? 15 * 60_000 : undefined,
  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // The journeys need the worker too: emails go outbox → relay → worker → Mailpit. PostgreSQL, both
  // Redis instances and Mailpit come from `pnpm docker:up` (local) or service containers (CI).
  webServer: [
    {
      // CI tests the production build (`pnpm build` first): `next dev` compiles each route on first visit,
      // which outran the 5s assertions, and renders dev-only overlays that intercept clicks.
      command: process.env.CI ? "pnpm start --port 3000" : "pnpm dev",
      url: "http://localhost:3000/health/live",
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
    {
      command: "pnpm --filter @nitap/worker dev",
      cwd: "../..",
      url: `http://localhost:${process.env.WORKER_HEALTH_PORT ?? "3001"}/health/live`,
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
  ],
});
