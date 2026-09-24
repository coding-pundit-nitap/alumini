import type { Instrumentation } from "next";

/** Runs once when the server starts. A malformed institutional-email policy stops startup (fail closed). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { createPrometheusMetrics, setMetrics } =
    await import("@nitap/observability");
  setMetrics(
    createPrometheusMetrics({
      service: "web",
      version: process.env.APP_VERSION ?? "dev",
    })
  );

  const { assertEmailPolicyValid } = await import("@/modules/auth");
  assertEmailPolicyValid();
}

/**
 * Runs for every server error Next.js catches (renders, Server Actions, unwrapped Route Handlers).
 * Node runtime only: the logger uses AsyncLocalStorage. The error tracker joins in 13B; tracing is
 * not used (ADR-028).
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
