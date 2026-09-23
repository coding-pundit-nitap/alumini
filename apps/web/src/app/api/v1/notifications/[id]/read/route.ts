import { markNotificationRead } from "@/composition/notifications";
import { assertSameOrigin } from "@/infrastructure/http/assert-same-origin";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { getActor } from "@/modules/auth";

import { uuidParam } from "../../../_lib/request";

type Params = { params: Promise<{ id: string }> };

/** POST /api/v1/notifications/:id/read — idempotent; someone else's or an unknown id is a 404. */
export const POST = routeHandler(async (request, ctx: Params) => {
  assertSameOrigin(request);
  await markNotificationRead({
    actor: await getActor(),
    id: uuidParam((await ctx.params).id),
  });
  return new Response(null, { status: 204 });
});
