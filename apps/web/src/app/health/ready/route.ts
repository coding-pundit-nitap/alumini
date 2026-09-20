import { readinessResponse } from "@/infrastructure/health/readiness-response";
import { routeHandler } from "@/infrastructure/http/route-handler";

/** Should this instance receive traffic? (reliability §4.1) */
export const GET = routeHandler(readinessResponse);
