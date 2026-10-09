import { z } from "zod";

import { listComments } from "@/composition/posts";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { getActor } from "@/modules/auth";

import { invalid, uuidParam } from "../../../_lib/request";

type Params = { params: Promise<{ id: string }> };

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().max(200).optional(),
});

/** GET /api/v1/posts/:id/comments — newest first, keyset-paged; 404 for a missing/deleted post. */
export const GET = routeHandler(async (request, ctx: Params) => {
  const parsed = listQuery.safeParse(
    Object.fromEntries(new URL(request.url).searchParams)
  );
  if (!parsed.success) throw invalid(parsed.error);
  const result = await listComments({
    actor: await getActor(),
    postId: uuidParam((await ctx.params).id),
    ...parsed.data,
  });
  return Response.json(result, {
    headers: { "Cache-Control": "private, no-store" },
  });
});
