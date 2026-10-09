import { z } from "zod";

import { getEvent } from "@/composition/events";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { NotFoundError } from "@/lib/errors";
import { getActor } from "@/modules/auth";

const id = z.uuid();

type Params = { params: Promise<{ id: string }> };

/** GET /api/v1/events/:id — the detail with live counts. */
export const GET = routeHandler(async (_request, ctx: Params) => {
  const eventId = id.safeParse((await ctx.params).id);
  if (!eventId.success) throw new NotFoundError();

  const data = await getEvent({
    actor: await getActor(),
    eventId: eventId.data,
  });
  return Response.json(
    { data },
    { headers: { "Cache-Control": "private, no-store" } }
  );
});
