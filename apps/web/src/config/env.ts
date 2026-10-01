import { z } from "zod";

const serverEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  // Optional at validation time so builds and tests that never touch the database still work;
  // src/infrastructure/database/client.ts throws if it is missing when a client is actually created.
  DATABASE_URL: z.string().min(1).optional(),
  // Connections per web instance (TDS §18.1, §25.1: an explicit cap per instance). Sized from the Phase 15
  // measurements; instances × this must stay under PostgreSQL's max_connections with the worker's share.
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  // Better Auth reads BETTER_AUTH_SECRET itself and refuses to run in production without it.
  // Optional here so builds and tests that never touch auth still work.
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  BETTER_AUTH_URL: z.string().url().optional(),
  // Cache / rate-limit Redis. Optional for the same reason; src/infrastructure/redis/client.ts throws if it is missing when used.
  REDIS_URL: z.string().min(1).optional(),
  // Job-queue Redis (separate server, ADR-007). Optional; the admin replay endpoint throws if it is missing when used.
  QUEUE_REDIS_URL: z.string().min(1).optional(),
  // Log threshold (reliability §6.3). Defaults: info, and silent under test.
  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error", "fatal", "silent"])
    .optional(),
  // Bearer token that lets monitoring see the `checks` detail of /health/ready in production.
  HEALTH_CHECK_TOKEN: z.string().min(16).optional(),
  // Error tracker (Sentry protocol: Sentry or GlitchTip); off when unset (spec 13B B-2).
  SENTRY_DSN: z.string().url().optional(),
  // Build/commit identifier stamped on every log line. Set by the deploy pipeline.
  APP_VERSION: z.string().min(1).optional(),
  // JSON map of recognised institutional email domains → { role, autoVerify }. Parsed and validated by
  // modules/auth (email-policy-config.ts) at server start; unset means no domain is institutional.
  INSTITUTIONAL_EMAIL_POLICY: z.string().optional(),
});

const clientEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

/**
 * Validate environment variables at build & runtime.
 */
function validateEnv() {
  const isServer = typeof window === "undefined";

  const parsedServer = serverEnvSchema.safeParse(process.env);
  if (!parsedServer.success && isServer) {
    console.error(
      "❌ Invalid server environment variables:",
      parsedServer.error.flatten().fieldErrors
    );
    throw new Error("Invalid server environment variables");
  }

  const parsedClient = clientEnvSchema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });

  if (!parsedClient.success) {
    console.error(
      "❌ Invalid client environment variables:",
      parsedClient.error.flatten().fieldErrors
    );
    throw new Error("Invalid client environment variables");
  }

  return {
    ...(parsedServer.success ? parsedServer.data : {}),
    ...parsedClient.data,
  };
}

export const env = validateEnv();
