import { env } from "@/config/env";

import { createLogger } from "./logger";

export { getMetrics, setMetrics } from "./metrics";
export type { Metrics, MetricLabels } from "./metrics";
export {
  getRequestContext,
  runWithRequestContext,
  setRequestUser,
} from "./request-context";
export { REQUEST_ID_HEADER, resolveRequestId } from "./request-id";
export type { Logger } from "./logger";

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
