import { health, healthDetailsVisible } from "./index";

/** Shared by `/health/ready` and `/health/startup`, which check the same things. */
export async function readinessResponse(request: Request): Promise<Response> {
  const result = await health.ready();
  const body = healthDetailsVisible(request)
    ? { status: result.status, checks: result.checks }
    : { status: result.status };

  return Response.json(body, {
    status: result.ready ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
