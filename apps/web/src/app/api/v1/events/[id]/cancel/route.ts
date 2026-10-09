import { z } from "zod";

import { cancelEvent } from "@/composition/events";
import { assertSameOrigin } from "@/infrastructure/http/assert-same-origin";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { NotFoundError } from "@/lib/errors";
import { getActor } from "@/modules/auth";

const id = z.uuid();

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/events/:id/cancel — the organizer or a manager cancels the
 * event.
 */
export const POST = routeHandler(async (request, ctx: Params) => {
  assertSameOrigin(request);
  const eventId = id.safeParse((await ctx.params).id);
  if (!eventId.success) throw new NotFoundError();

  const { eventId: cancelledId } = await cancelEvent({
    actor: await getActor(),
    eventId: eventId.data,
  });
  return Response.json({ data: { eventId: cancelledId } });
});
