import { z } from "zod";

import { listRegistrants, registerForEvent } from "@/composition/events";
import { assertSameOrigin } from "@/infrastructure/http/assert-same-origin";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { respondIdempotently } from "@/infrastructure/idempotency";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { getActor } from "@/modules/auth";
import { readBodyText } from "../../../_lib/request";

const id = z.uuid();

type Params = { params: Promise<{ id: string }> };

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().max(200).optional(),
});

/** GET /api/v1/events/:id/registrations?limit=&cursor= — organizer/manager only. */
export const GET = routeHandler(async (request, ctx: Params) => {
  const eventId = id.safeParse((await ctx.params).id);
  if (!eventId.success) throw new NotFoundError();

  const params = new URL(request.url).searchParams;
  const parsed = listQuery.safeParse({
    limit: params.get("limit") ?? undefined,
    cursor: params.get("cursor") ?? undefined,
  });
  if (!parsed.success) {
    throw new ValidationError({
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "(query)",
        code: "INVALID",
        message: issue.message,
      })),
    });
  }

  const result = await listRegistrants({
    actor: await getActor(),
    eventId: eventId.data,
    ...parsed.data,
  });
  return Response.json(result, {
    headers: { "Cache-Control": "private, no-store" },
  });
});

/** POST /api/v1/events/:id/registrations — register for an event. Honours `Idempotency-Key`. */
export const POST = routeHandler(async (request, ctx: Params) => {
  assertSameOrigin(request);
  const eventId = id.safeParse((await ctx.params).id);
  // A malformed id and an unknown one are the same answer.
  if (!eventId.success) throw new NotFoundError();

  const rawBody = await readBodyText(request);
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
