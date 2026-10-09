import { readinessResponse } from "@/infrastructure/health/readiness-response";
import { routeHandler } from "@/infrastructure/http/route-handler";

/** Should this instance receive traffic? */
export const GET = routeHandler(readinessResponse);
