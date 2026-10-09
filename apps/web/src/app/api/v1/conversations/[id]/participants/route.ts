import { z } from "zod";

import { addParticipant } from "@/composition/messaging";
import { assertSameOrigin } from "@/infrastructure/http/assert-same-origin";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { getActor } from "@/modules/auth";

import { invalid, readJson, uuidParam } from "../../../_lib/request";

type Params = { params: Promise<{ id: string }> };
const body = z.object({ userId: z.uuid() }).strict();

/**
 * POST /api/v1/conversations/:id/participants — the group's creator adds a
 * member.
 */
export const POST = routeHandler(async (request, ctx: Params) => {
  assertSameOrigin(request);
  const parsed = body.safeParse(await readJson(request));
  if (!parsed.success) throw invalid(parsed.error);
  const { added } = await addParticipant({
    actor: await getActor(),
    conversationId: uuidParam((await ctx.params).id),
    userId: parsed.data.userId,
  });
  return Response.json({ data: { added } });
});
