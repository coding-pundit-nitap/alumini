/**
 * Global setup for the `integration` and `contract` projects.
 *
 * These projects run against a real PostgreSQL and Redis (strategy §6.2). Fail fast with an
 * actionable message instead of letting every test time out on a refused connection.
 * Phase 1 extends this with schema provisioning and per-worker isolation.
 */
export default function setup() {
  const missing = ["DATABASE_URL", "REDIS_URL"].filter(
    (name) => !process.env[name]
  );
  if (missing.length > 0) {
    throw new Error(
      `Integration tests need ${missing.join(", ")}. Run \`pnpm docker:up\` and copy .env.example to .env.`
    );
  }
}
