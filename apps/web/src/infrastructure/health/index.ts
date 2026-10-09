import { env } from "@/config/env";

import { canSeeHealthDetails } from "./access";
import { createHealthService } from "./health-service";

/**
 * Clients load lazily so the liveness route never touches them. Kept on
 * `globalThis` because Next.js can bundle instrumentation and routes
 * separately, and both must share one instance.
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
