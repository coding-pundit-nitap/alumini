import { health } from "@/infrastructure/health";
import { routeHandler } from "@/infrastructure/http/route-handler";

/** Is the process alive? Checks nothing external (reliability §4.1). */
export const GET = routeHandler(() =>
  Response.json(health.live(), { headers: { "Cache-Control": "no-store" } })
);
