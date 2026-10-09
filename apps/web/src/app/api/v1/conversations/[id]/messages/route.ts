import { z } from "zod";

import { listMessages, sendMessage } from "@/composition/messaging";
import { assertSameOrigin } from "@/infrastructure/http/assert-same-origin";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { getActor } from "@/modules/auth";

import { invalid, readJson, uuidParam } from "../../../_lib/request";

type Params = { params: Promise<{ id: string }> };
const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().max(200).optional(),
});

/** GET /api/v1/conversations/:id/messages — newest first, keyset-paged. */
export const GET = routeHandler(async (request, ctx: Params) => {
  const parsed = listQuery.safeParse(
    Object.fromEntries(new URL(request.url).searchParams)
  );
  if (!parsed.success) throw invalid(parsed.error);
  const result = await listMessages({
    actor: await getActor(),
    conversationId: uuidParam((await ctx.params).id),
    ...parsed.data,
  });
  return Response.json(result, {
    headers: { "Cache-Control": "private, no-store" },
  });
});

/**
 * POST /api/v1/conversations/:id/messages — send. `clientMessageId` makes a
 * retry return the first result (200).
 */
export const POST = routeHandler(async (request, ctx: Params) => {
  assertSameOrigin(request);
  const input = await readJson(request);
  const { message, created } = await sendMessage({
    actor: await getActor(),
    conversationId: uuidParam((await ctx.params).id),
    input,
  });
  return Response.json(
    {
      data: {
        id: message.id,
        seq: message.seq,
        conversationId: message.conversationId,
        senderId: message.senderId,
        body: message.body,
        createdAt: message.createdAt,
      },
    },
    { status: created ? 201 : 200 }
  );
});
