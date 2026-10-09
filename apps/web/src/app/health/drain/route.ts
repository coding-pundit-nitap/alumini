import { health, healthDetailsVisible } from "@/infrastructure/health";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { logger } from "@/infrastructure/observability";

/**
 * POST /health/drain — take this instance out of rotation before it is stopped:
 * readiness answers 503 from now on and open message streams end so they reconnect to the live instance.
 * In-flight requests are untouched; the SIGTERM that follows lets Next.js finish them.
 *
 * Same access rule as health details and /metrics: open outside production, the monitoring bearer token in
 * production, and a plain 404 to anyone else so the endpoint is not advertised.
 */
export const POST = routeHandler(async (request) => {
  if (!healthDetailsVisible(request)) {
    return new Response(null, { status: 404 });
  }
  if (!health.isDraining())
    logger.info("web.drain.started", { metadata: { trigger: "endpoint" } });
  health.startDraining();
  return Response.json(
    { status: "draining" },
    { status: 202, headers: { "Cache-Control": "no-store" } }
  );
});
