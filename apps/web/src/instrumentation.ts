import type { Instrumentation } from "next";

/** Missing production config or a malformed email policy stops startup. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { exitIfMisconfigured } = await import("@/config/production-config");
  exitIfMisconfigured();

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

  const { drainOnSigterm } =
    await import("@/infrastructure/health/drain-on-sigterm");
  drainOnSigterm();
}

/** Node runtime only: the logger uses AsyncLocalStorage. */
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
