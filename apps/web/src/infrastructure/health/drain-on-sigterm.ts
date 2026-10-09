import { logger } from "@/infrastructure/observability";

import { health } from "./index";

/**
 * On SIGTERM, fail readiness and end open message streams so they don't hold the shutdown.
 * Kept separate so the Edge build of instrumentation.ts never sees `process.once`.
 */
export function drainOnSigterm(): void {
  process.once("SIGTERM", () => {
    if (!health.isDraining())
      logger.info("web.drain.started", { metadata: { trigger: "SIGTERM" } });
    health.startDraining();
  });
}
