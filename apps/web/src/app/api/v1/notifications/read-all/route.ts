import { markAllNotificationsRead } from "@/composition/notifications";
import { assertSameOrigin } from "@/infrastructure/http/assert-same-origin";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { getActor } from "@/modules/auth";

/**
 * POST /api/v1/notifications/read-all — marks all of the caller's unread
 * notifications read.
 */
export const POST = routeHandler(async (request) => {
  assertSameOrigin(request);
  const { updated } = await markAllNotificationsRead({
    actor: await getActor(),
  });
  return Response.json({ data: { updated } });
});
