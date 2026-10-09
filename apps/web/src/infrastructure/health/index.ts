import { env } from "@/config/env";

import { canSeeHealthDetails } from "./access";
import { createHealthService } from "./health-service";

/**
 * The web process's health service, wired to PostgreSQL and the cache Redis. Clients are imported
 * lazily so the liveness route never loads them and a missing DATABASE_URL cannot fail a build.
 *
 * Kept on `globalThis` (like the metrics registry): Next.js can bundle `instrumentation.ts`
 * and the route handlers into separate module graphs, and the SIGTERM listener registered there must drain
 * the same instance the readiness route and the message streams use.
 */
const HEALTH = Symbol.for("nitap.web.health");
const slot = globalThis as unknown as {
  [HEALTH]?: ReturnType<typeof createHealthService>;
};

export const health = (slot[HEALTH] ??= createHealthService({
  checkPostgres: async () => {
    const { prisma } = await import("@/infrastructure/database/client");
    await prisma.$queryRaw`SELECT 1`;
  },
  checkRedis: async () => {
    const { getRedis } = await import("@/infrastructure/redis/client");
    const redis = await getRedis();
    await redis.ping();
  },
}));

export function healthDetailsVisible(request: Request): boolean {
  return canSeeHealthDetails(request, {
    nodeEnv: env.NODE_ENV ?? "development",
    token: env.HEALTH_CHECK_TOKEN,
  });
}
