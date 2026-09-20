import { z } from "zod";

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Optional at validation time so builds and tests that never touch the database still work;
  // src/lib/prisma.ts throws if it is missing when a client is actually created.
  DATABASE_URL: z.string().min(1).optional(),
  // Better Auth reads BETTER_AUTH_SECRET itself and refuses to run in production without it.
  // Optional here so builds and tests that never touch auth still work.
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  BETTER_AUTH_URL: z.string().url().optional(),
  // Cache / rate-limit Redis. Optional for the same reason; src/lib/redis.ts throws if it is missing when used.
  REDIS_URL: z.string().min(1).optional(),
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
    console.error("❌ Invalid server environment variables:", parsedServer.error.flatten().fieldErrors);
    throw new Error("Invalid server environment variables");
  }

  const parsedClient = clientEnvSchema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });

  if (!parsedClient.success) {
    console.error("❌ Invalid client environment variables:", parsedClient.error.flatten().fieldErrors);
    throw new Error("Invalid client environment variables");
  }

  return {
    ...(parsedServer.success ? parsedServer.data : {}),
    ...parsedClient.data,
  };
}

export const env = validateEnv();
