import { getConversation } from "@/composition/messaging";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { getActor } from "@/modules/auth";

import { uuidParam } from "../../_lib/request";

type Params = { params: Promise<{ id: string }> };

/** GET /api/v1/conversations/:id — participants, unread count and read marker. */
export const GET = routeHandler(async (_request, ctx: Params) => {
  const detail = await getConversation({
    actor: await getActor(),
    conversationId: uuidParam((await ctx.params).id),
  });
  return Response.json(
    { data: detail },
    { headers: { "Cache-Control": "private, no-store" } }
  );
});
