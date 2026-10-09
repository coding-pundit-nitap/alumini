import { health, healthDetailsVisible } from "@/infrastructure/health";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { logger } from "@/infrastructure/observability";

/**
 * Takes this instance out of rotation: readiness returns 503 and open message
 * streams end. Same access rule as /metrics; 404 to anyone else.
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
