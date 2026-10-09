import { createUploadStore } from "@nitap/database/uploads";
import {
  canSeeHealthDetails,
  captureError,
  createLogger,
  createPrometheusMetrics,
  flushErrorTracker,
  initErrorTracker,
  recordPoolStats,
  setMetrics,
} from "@nitap/observability";
import { createQueueAdmin } from "@nitap/queue";
import { createS3StoragePort, loadStorageEnv } from "@nitap/storage";

import { composeWorker } from "./compose.ts";
import { loadEnv } from "./env.ts";
import { createClamdScanner, parseClamavUrl } from "./clamav.ts";
import { startHealthServer } from "./health.ts";
import { createPrismaClient } from "./prisma.ts";
import { registerQueueDepthCollector } from "./queue-depth.ts";
import { registerUploadScanBacklogCollector } from "./upload-scan-backlog.ts";

const env = loadEnv(process.env);
const storage = createS3StoragePort(loadStorageEnv(process.env));
const logger = createLogger({
  level: env.LOG_LEVEL ?? "info",
  service: "worker",
  env: env.NODE_ENV,
  version: env.APP_VERSION ?? "dev",
  format: env.NODE_ENV === "development" ? "pretty" : "json",
});

initErrorTracker({
  dsn: env.SENTRY_DSN,
  environment: env.NODE_ENV,
  release: env.APP_VERSION ?? "dev",
  service: "worker",
});
// Installed before anything records a metric.
const metrics = createPrometheusMetrics({
  service: "worker",
  version: env.APP_VERSION ?? "dev",
});
setMetrics(metrics);
const { prisma, pool } = createPrismaClient(env.DATABASE_URL);
const queueAdmin = createQueueAdmin({ url: env.QUEUE_REDIS_URL });
registerQueueDepthCollector(metrics, queueAdmin);
registerUploadScanBacklogCollector(metrics, prisma, createUploadStore());
const worker = composeWorker({
  prisma,
  logger,
  metrics,
  storage,
  config: {
    queueRedisUrl: env.QUEUE_REDIS_URL,
    cacheRedisUrl: env.REDIS_URL,
    smtpUrl: env.SMTP_URL,
    emailFrom: env.EMAIL_FROM,
    appUrl: env.APP_URL,
    emailRatePerSecond: env.EMAIL_RATE_PER_SECOND,
    ...(env.CLAMAV_URL
      ? { scanner: createClamdScanner(parseClamavUrl(env.CLAMAV_URL)) }
      : {}),
  },
});
logger.info("worker.upload_scanner", {
  metadata: { scanner: env.CLAMAV_URL ? "clamav" : "passthrough" },
});

await worker.start();
const health = await startHealthServer({
  port: env.WORKER_HEALTH_PORT,
  ready: () => worker.ready(),
  metrics: {
    authorize: ({ headers }) =>
      canSeeHealthDetails(
        new Request("http://worker/metrics", {
          headers:
            typeof headers.authorization === "string"
              ? { authorization: headers.authorization }
              : {},
        }),
        { nodeEnv: env.NODE_ENV, token: env.HEALTH_CHECK_TOKEN }
      ),
    render: async () => {
      recordPoolStats(metrics, pool);
      return metrics.render();
    },
  },
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
    await queueAdmin.close();
    await health.close();
    await prisma.$disconnect();
    await flushErrorTracker();
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
  captureError(reason, { tags: { kind: "unhandled_rejection" } });
  void flushErrorTracker().finally(() => process.exit(1));
});
