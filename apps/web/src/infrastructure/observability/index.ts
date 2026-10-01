import { createLogger } from "@nitap/observability";

import { env } from "@/config/env";

export {
  captureError,
  getMetrics,
  noopMetrics,
  setMetrics,
  getRequestContext,
  runWithRequestContext,
  setRequestUser,
  REQUEST_ID_HEADER,
  resolveRequestId,
} from "@nitap/observability";
export type { Logger, Metrics, MetricLabels } from "@nitap/observability";

// `env` is typed as possibly partial (validation failure throws on the server), so default NODE_ENV here.
const nodeEnv = env.NODE_ENV ?? "development";

/** The process-wide logger for the web process. The worker builds its own with `service: "worker"`. */
export const logger = createLogger({
  level: env.LOG_LEVEL ?? (nodeEnv === "test" ? "silent" : "info"),
  service: "web",
  env: nodeEnv,
  version: env.APP_VERSION ?? "dev",
  format: nodeEnv === "development" ? "pretty" : "json",
});
