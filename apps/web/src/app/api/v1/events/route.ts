import { z } from "zod";

import { createEvent, getEvent, listEvents } from "@/composition/events";
import { assertSameOrigin } from "@/infrastructure/http/assert-same-origin";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { respondIdempotently } from "@/infrastructure/idempotency";
import { ValidationError } from "@/lib/errors";
import { getActor } from "@/modules/auth";
import { parseJson, readBodyText } from "../_lib/request";

/** POST /api/v1/events — create an event (FR-EVENT-001). Honours `Idempotency-Key` (spec E-14). The use case validates the body. */
export const POST = routeHandler(async (request) => {
  assertSameOrigin(request);
  const rawBody = await readBodyText(request);
  const actor = await getActor();

  return respondIdempotently(request, {
    userId: actor?.userId ?? null,
    rawBody,
    execute: async () => {
      const input = parseJson(rawBody);
      const { eventId } = await createEvent({ actor, input });
      return {
        status: 201,
        body: { data: await getEvent({ actor, eventId }) },
        headers: { Location: `/api/v1/events/${eventId}` },
      };
    },
  });
});

const listQuery = z.object({
  scope: z.enum(["upcoming", "mine", "past"]).default("upcoming"),
  includeCancelled: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().max(200).optional(),
});

/** GET /api/v1/events?scope=&includeCancelled=&limit=&cursor= (spec E-10). */
export const GET = routeHandler(async (request) => {
  const params = new URL(request.url).searchParams;
  const parsed = listQuery.safeParse({
    scope: params.get("scope") ?? undefined,
    includeCancelled: params.get("includeCancelled") ?? undefined,
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
  const result = await listEvents({ actor: await getActor(), ...parsed.data });
  return Response.json(result, {
    headers: { "Cache-Control": "private, no-store" },
  });
});
