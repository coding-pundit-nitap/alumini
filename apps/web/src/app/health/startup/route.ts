import { readinessResponse } from "@/infrastructure/health/readiness-response";
import { routeHandler } from "@/infrastructure/http/route-handler";

/** Has boot finished? Same checks as ready, used only during start. */
export const GET = routeHandler(readinessResponse);
