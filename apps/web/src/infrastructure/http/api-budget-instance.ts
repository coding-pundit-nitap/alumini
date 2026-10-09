import { redisRateLimitStorage } from "@/infrastructure/redis/rate-limit-storage";

import { createApiBudget } from "./api-budget";

/**
 * The process-wide API budget: Redis counters shared by every instance,
 * stricter in-memory if Redis is down.
 */
export const apiBudget = createApiBudget({
  consume: (key, rule) => redisRateLimitStorage.consume(key, rule),
});
