import Redis from "ioredis";

import { env } from "@/config/env";

// This is the CACHE / rate-limit Redis: keys here may be evicted (allkeys-lru), so nothing in it may
// be unrecoverable. The job queue needs a separate Redis with noeviction (docs/architecture/ADR-005).
const globalForRedis = globalThis as unknown as {
  redis?: Redis;
  redisConnecting?: Promise<void>;
  redisLastErrorLog?: number;
};

function createRedis() {
  if (!env.REDIS_URL) {
    throw new Error("REDIS_URL is not set");
  }

  const client = new Redis(env.REDIS_URL, {
    lazyConnect: true, // never connect at import time (builds, tests)
    enableOfflineQueue: false, // fail fast while disconnected so callers can fall back
    maxRetriesPerRequest: 1,
    commandTimeout: 250, // ms: a slow Redis must not slow every auth request
    connectTimeout: 1_000,
  });

  // An unhandled 'error' event would crash the process; log it, at most once every 30 seconds.
  client.on("error", (error) => {
    const now = Date.now();
    if (now - (globalForRedis.redisLastErrorLog ?? 0) > 30_000) {
      globalForRedis.redisLastErrorLog = now;
      console.error("[redis] connection error:", error.message);
    }
  });

  return client;
}

/**
 * Returns a connected client. Rejects quickly if Redis is unreachable.
 * Concurrent first callers share one in-flight connection attempt; without that, all but the
 * first would see a not-yet-ready client, fail fast (offline queue is off) and needlessly hit
 * the weaker fallback path on a cold start under load.
 */
export async function getRedis(): Promise<Redis> {
  const client = (globalForRedis.redis ??= createRedis());

  if (client.status === "wait") {
    globalForRedis.redisConnecting = client.connect().finally(() => {
      globalForRedis.redisConnecting = undefined;
    });
  }
  if (globalForRedis.redisConnecting) {
    await globalForRedis.redisConnecting;
  }

  return client;
}
