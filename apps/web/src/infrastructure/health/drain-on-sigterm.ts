import { logger } from "@/infrastructure/observability";

import { health } from "./index";

/**
 * Next.js stops accepting connections on SIGTERM and finishes in-flight requests (self-hosting guide). This
 * listener runs alongside it: readiness answers 503 and open message streams end, since an open stream would
 * otherwise hold the shutdown until the grace period kills the process (spec 14 RD-4, F-4). Deploys call
 * POST /health/drain first so the load balancer has already stopped sending traffic (reliability §8.3).
 *
 * Its own module, imported only in the Node.js runtime: Next.js analyses instrumentation.ts for the Edge
 * runtime too and flags `process.once` there even behind a runtime check (instrumentation guide).
 */
export function drainOnSigterm(): void {
  process.once("SIGTERM", () => {
    if (!health.isDraining())
      logger.info("web.drain.started", { metadata: { trigger: "SIGTERM" } });
    health.startDraining();
  });
}
