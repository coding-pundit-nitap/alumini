import type { Instrumentation } from "next";

/** Runs once when the server starts. A malformed institutional-email policy stops startup (fail closed). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { createPrometheusMetrics, initErrorTracker, setMetrics } =
    await import("@nitap/observability");
  initErrorTracker({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? "development",
    release: process.env.APP_VERSION ?? "dev",
    service: "web",
  });
  setMetrics(
    createPrometheusMetrics({
      service: "web",
      version: process.env.APP_VERSION ?? "dev",
    })
  );

  const { assertEmailPolicyValid } = await import("@/modules/auth");
  assertEmailPolicyValid();

  // Next.js stops accepting connections on SIGTERM and finishes in-flight requests (self-hosting guide). This
  // listener runs alongside it: readiness answers 503 and open message streams end, since an open stream would
  // otherwise hold the shutdown until the grace period kills the process (spec 14 RD-4, F-4). Deploys call
  // POST /health/drain first so the load balancer has already stopped sending traffic (reliability §8.3).
  const { health } = await import("@/infrastructure/health");
  const { logger } = await import("@/infrastructure/observability");
  process.once("SIGTERM", () => {
    if (!health.isDraining())
      logger.info("web.drain.started", { metadata: { trigger: "SIGTERM" } });
    health.startDraining();
  });
}

/**
 * Runs for every server error Next.js catches (renders, Server Actions, unwrapped Route Handlers).
 * Node runtime only: the logger uses AsyncLocalStorage. Logged and sent to the error tracker (13B);
 * tracing is not used (ADR-028).
 */
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { reportRequestError } =
    await import("@/infrastructure/observability/report-request-error");
  await reportRequestError(error, request, context);
};
