import { z } from "zod";

import { listFeed } from "@/composition/posts";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { getActor } from "@/modules/auth";

import { invalid } from "../_lib/request";

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().max(200).optional(),
});

/** GET /api/v1/posts — the feed, newest first, keyset-paged. */
export const GET = routeHandler(async (request) => {
  const parsed = listQuery.safeParse(
    Object.fromEntries(new URL(request.url).searchParams)
  );
  if (!parsed.success) throw invalid(parsed.error);
  const result = await listFeed({ actor: await getActor(), ...parsed.data });
  return Response.json(result, {
    headers: { "Cache-Control": "private, no-store" },
  });
});
