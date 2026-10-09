import { health } from "@/infrastructure/health";
import { routeHandler } from "@/infrastructure/http/route-handler";

/** Is the process alive? Checks nothing external. */
export const GET = routeHandler(() =>
  Response.json(health.live(), { headers: { "Cache-Control": "no-store" } })
);
