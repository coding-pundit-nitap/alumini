import { prisma } from "@/infrastructure/database/client";
import { redisRateLimitStorage } from "@/infrastructure/redis/rate-limit-storage";
import { authorize, can } from "@/modules/auth";
import {
  createListDepartments,
  createPostgresSearch,
  createSearchDirectory,
} from "@/modules/directory";

/** Wires the directory module to PostgreSQL search (Stage A) and the shared Redis rate limiter. */
export const searchDirectory = createSearchDirectory({
  authorize,
  can,
  search: createPostgresSearch(prisma),
  rateLimiter: redisRateLimitStorage,
});

export const listDepartments = createListDepartments(prisma);
