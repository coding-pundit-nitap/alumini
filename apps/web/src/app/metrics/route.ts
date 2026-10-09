import { getPrometheusMetrics, recordPoolStats } from "@nitap/observability";

import { pool } from "@/infrastructure/database/client";
import { healthDetailsVisible } from "@/infrastructure/health";
import { logger } from "@/infrastructure/observability";

/** Prometheus scrape target. Refused callers get a bare 404. */
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
