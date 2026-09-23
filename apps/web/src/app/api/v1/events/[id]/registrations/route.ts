import { z } from "zod";

import { registerForEvent } from "@/composition/events";
import { assertSameOrigin } from "@/infrastructure/http/assert-same-origin";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { respondIdempotently } from "@/infrastructure/idempotency";
import { NotFoundError } from "@/lib/errors";
import { getActor } from "@/modules/auth";

const id = z.uuid();

type Params = { params: Promise<{ id: string }> };

/** POST /api/v1/events/:id/registrations — register for an event (FR-EVENT-005). Honours `Idempotency-Key` (spec E-14). */
export const POST = routeHandler(async (request, ctx: Params) => {
  assertSameOrigin(request);
  const eventId = id.safeParse((await ctx.params).id);
  // A malformed id and an unknown one are the same answer.
  if (!eventId.success) throw new NotFoundError();

  const rawBody = await request.text();
  const actor = await getActor();

  return respondIdempotently(request, {
    userId: actor?.userId ?? null,
    rawBody,
    execute: async () => {
      const { registrationId } = await registerForEvent({
        actor,
        eventId: eventId.data,
      });
      return { status: 201, body: { data: { registrationId } }, headers: {} };
    },
  });
});
