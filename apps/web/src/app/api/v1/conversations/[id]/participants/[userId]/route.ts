import { removeParticipant } from "@/composition/messaging";
import { assertSameOrigin } from "@/infrastructure/http/assert-same-origin";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { getActor } from "@/modules/auth";

import { uuidParam } from "../../../../_lib/request";

type Params = { params: Promise<{ id: string; userId: string }> };

/**
 * DELETE /api/v1/conversations/:id/participants/:userId — the creator removes a
 * member; a member removing themselves leaves.
 */
export const DELETE = routeHandler(async (request, ctx: Params) => {
  assertSameOrigin(request);
  const params = await ctx.params;
  await removeParticipant({
    actor: await getActor(),
    conversationId: uuidParam(params.id),
    userId: uuidParam(params.userId),
  });
  return new Response(null, { status: 204 });
});
