import { env } from "@/config/env";

import { canSeeHealthDetails } from "./access";
import { createHealthService } from "./health-service";

/**
 * The web process's health service, wired to PostgreSQL and the cache Redis. Clients are imported
 * lazily so the liveness route never loads them and a missing DATABASE_URL cannot fail a build.
 */
export const health = createHealthService({
  checkPostgres: async () => {
    const { prisma } = await import("@/infrastructure/database/client");
    await prisma.$queryRaw`SELECT 1`;
  },
  checkRedis: async () => {
    const { getRedis } = await import("@/infrastructure/redis/client");
    const redis = await getRedis();
    await redis.ping();
  },
});

export function healthDetailsVisible(request: Request): boolean {
  return canSeeHealthDetails(request, {
    nodeEnv: env.NODE_ENV ?? "development",
    token: env.HEALTH_CHECK_TOKEN,
  });
}
