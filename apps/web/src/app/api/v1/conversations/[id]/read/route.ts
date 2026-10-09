import { markRead } from "@/composition/messaging";
import { assertSameOrigin } from "@/infrastructure/http/assert-same-origin";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { getActor } from "@/modules/auth";

import { readJson, uuidParam } from "../../../_lib/request";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/conversations/:id/read — body `{ upToSeq }`: mark everything up
 * to what the client displayed.
 */
export const POST = routeHandler(async (request, ctx: Params) => {
  assertSameOrigin(request);
  const input = await readJson(request);
  await markRead({
    actor: await getActor(),
    conversationId: uuidParam((await ctx.params).id),
    input,
  });
  return new Response(null, { status: 204 });
});
