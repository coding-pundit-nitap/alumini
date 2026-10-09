import { z } from "zod";

import { cancelRegistration } from "@/composition/events";
import { assertSameOrigin } from "@/infrastructure/http/assert-same-origin";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { NotFoundError } from "@/lib/errors";
import { getActor } from "@/modules/auth";

const id = z.uuid();

type Params = { params: Promise<{ id: string }> };

/**
 * DELETE /api/v1/events/:id/registrations/me — cancel the caller's own
 * registration.
 */
export const DELETE = routeHandler(async (request, ctx: Params) => {
  assertSameOrigin(request);
  const eventId = id.safeParse((await ctx.params).id);
  if (!eventId.success) throw new NotFoundError();

  await cancelRegistration({
    actor: await getActor(),
    eventId: eventId.data,
  });
  return new Response(null, { status: 204 });
});
