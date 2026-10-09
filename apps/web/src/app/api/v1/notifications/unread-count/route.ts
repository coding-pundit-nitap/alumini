import { getUnreadCount } from "@/composition/notifications";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { getActor } from "@/modules/auth";

/** GET /api/v1/notifications/unread-count — Redis-first, Postgres fallback; never 503. */
export const GET = routeHandler(async () => {
  const count = await getUnreadCount({ actor: await getActor() });
  return Response.json(
    { data: { count } },
    { headers: { "Cache-Control": "private, no-store" } }
  );
});
