import { createLogger, getMetrics } from "@nitap/observability";
import { createS3StoragePort, loadStorageEnv } from "@nitap/storage";

import { composeWorker } from "./compose.ts";
import { loadEnv } from "./env.ts";
import { startHealthServer } from "./health.ts";
import { createPrismaClient } from "./prisma.ts";

const env = loadEnv(process.env);
const storage = createS3StoragePort(loadStorageEnv(process.env));
const logger = createLogger({
  level: env.LOG_LEVEL ?? "info",
  service: "worker",
  env: env.NODE_ENV,
  version: env.APP_VERSION ?? "dev",
  format: env.NODE_ENV === "development" ? "pretty" : "json",
});

// Metrics stay the no-op adapter until Phase 13 installs an exporter (decision D10).
const prisma = createPrismaClient(env.DATABASE_URL);
const worker = composeWorker({
  prisma,
  logger,
  metrics: getMetrics(),
  storage,
  config: {
    queueRedisUrl: env.QUEUE_REDIS_URL,
    cacheRedisUrl: env.REDIS_URL,
    smtpUrl: env.SMTP_URL,
    emailFrom: env.EMAIL_FROM,
    emailRatePerSecond: env.EMAIL_RATE_PER_SECOND,
  },
});

await worker.start();
const health = await startHealthServer({
  port: env.WORKER_HEALTH_PORT,
  ready: () => worker.ready(),
});
logger.info("worker.started", { metadata: { healthPort: health.port } });

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info("worker.shutdown.started", { metadata: { signal } });
  // Backstop: never hang a deploy. In-flight jobs that do not finish return to the queue.
  const backstop = setTimeout(() => {
    logger.error("worker.shutdown.timeout");
    process.exit(1);
  }, 45_000);
  backstop.unref();
  try {
    await worker.stop();
    await health.close();
    await prisma.$disconnect();
    logger.info("worker.shutdown.complete");
    process.exit(0);
  } catch (error) {
    logger.error("worker.shutdown.failed", { error });
    process.exit(1);
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  logger.fatal("worker.unhandled_rejection", { error: reason });
  process.exit(1);
});
