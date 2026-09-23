import { z } from "zod";

import {
  authorizeNotifications,
  listNotifications,
} from "@/composition/notifications";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { getActor } from "@/modules/auth";

import { invalid } from "../_lib/request";

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().max(200).optional(),
});

/** GET /api/v1/notifications?limit=&cursor= — the caller's own notifications, newest first. */
export const GET = routeHandler(async (request) => {
  const actor = await getActor();
  authorizeNotifications(actor); // 401/403 before the query is validated
  const params = new URL(request.url).searchParams;
  const parsed = listQuery.safeParse({
    limit: params.get("limit") ?? undefined,
    cursor: params.get("cursor") ?? undefined,
  });
  if (!parsed.success) throw invalid(parsed.error);
  const result = await listNotifications({
    actor,
    ...parsed.data,
  });
  return Response.json(result, {
    headers: { "Cache-Control": "private, no-store" },
  });
});
