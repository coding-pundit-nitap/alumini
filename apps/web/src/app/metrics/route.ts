import { getPrometheusMetrics, recordPoolStats } from "@nitap/observability";

import { pool } from "@/infrastructure/database/client";
import { healthDetailsVisible } from "@/infrastructure/health";
import { logger } from "@/infrastructure/observability";

/**
 * Prometheus scrape target (spec 13A A-6). Not wrapped in routeHandler: a scrape is not API traffic.
 * Refused callers get a bare 404 so the endpoint is not advertised.
 */
export async function GET(request: Request): Promise<Response> {
  const metrics = getPrometheusMetrics();
  if (!metrics || !healthDetailsVisible(request)) {
    return new Response(null, { status: 404 });
  }
  try {
    recordPoolStats(metrics, pool);
    const { contentType, body } = await metrics.render();
    return new Response(body, {
      headers: { "content-type": contentType, "cache-control": "no-store" },
    });
  } catch (error) {
    logger.error("metrics.render.failed", { error });
    return new Response(null, { status: 500 });
  }
}
