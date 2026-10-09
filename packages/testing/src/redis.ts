import { randomUUID } from "node:crypto";

import { Redis } from "ioredis";

export function queueRedisUrl(): string {
  const url = process.env.QUEUE_REDIS_URL;
  if (!url) {
    throw new Error(
      "QUEUE_REDIS_URL is not set. Run `pnpm docker:up` and copy .env.example to .env."
    );
  }
  return url;
}

export type RedisNamespace = {
  /** BullMQ key prefix unique to this test: keys look like `<prefix>:<queue>:…`. */
  prefix: string;
  url: string;
  /** Deletes every key under the prefix and closes the helper connection. */
  cleanup(): Promise<void>;
};

/** Isolates one test's queue keys so concurrent test files never see each other's jobs. */
export async function createRedisNamespace(): Promise<RedisNamespace> {
  const url = queueRedisUrl();
  const prefix = `test-${randomUUID()}`;
  return {
    prefix,
    url,
    async cleanup() {
      const redis = new Redis(url, { maxRetriesPerRequest: null });
      try {
        let cursor = "0";
        do {
          const [next, keys] = await redis.scan(
            cursor,
            "MATCH",
            `${prefix}:*`,
            "COUNT",
            200
          );
          cursor = next;
          if (keys.length > 0) await redis.del(...keys);
        } while (cursor !== "0");
      } finally {
        await redis.quit();
      }
    },
  };
}
