import { z } from "zod";

import { listConnections, requestConnection } from "@/composition/connections";
import { assertSameOrigin } from "@/infrastructure/http/assert-same-origin";
import { respondIdempotently } from "@/infrastructure/idempotency";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { ValidationError } from "@/lib/errors";
import { getActor } from "@/modules/auth";

const createBody = z.object({ recipientId: z.uuid() }).strict();

const listQuery = z.object({
  state: z.enum(["PENDING", "ACCEPTED", "BLOCKED"]).default("ACCEPTED"),
  direction: z.enum(["INCOMING", "OUTGOING"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().max(200).optional(),
});

const invalid = (error: z.ZodError) =>
  new ValidationError({
    details: error.issues.map((issue) => ({
      field: issue.path.join(".") || "(body)",
      code: "INVALID",
      message: issue.message,
    })),
  });

/** POST /api/v1/connections — send a request (API spec §6.1). Honours `Idempotency-Key` (§1.6). */
export const POST = routeHandler(async (request) => {
  assertSameOrigin(request);
  const rawBody = await request.text();
  const actor = await getActor();

  return respondIdempotently(request, {
    userId: actor?.userId ?? null,
    rawBody,
    execute: async () => {
      const body = (() => {
        try {
          return JSON.parse(rawBody) as unknown;
        } catch {
          throw new ValidationError({ code: "MALFORMED_REQUEST" });
        }
      })();
      const parsed = createBody.safeParse(body);
      if (!parsed.success) throw invalid(parsed.error);

      const { connectionId } = await requestConnection({
        actor,
        recipientId: parsed.data.recipientId,
      });
      return {
        status: 201,
        body: {
          data: { id: connectionId, state: "PENDING", direction: "OUTGOING" },
        },
        headers: { Location: `/api/v1/connections/${connectionId}` },
      };
    },
  });
});

/** GET /api/v1/connections — the caller's own list (API spec §6.3). */
export const GET = routeHandler(async (request) => {
  const parsed = listQuery.safeParse(
    Object.fromEntries(new URL(request.url).searchParams)
  );
  if (!parsed.success) throw invalid(parsed.error);

  const result = await listConnections({
    actor: await getActor(),
    ...parsed.data,
  });
  return Response.json(result, {
    headers: { "Cache-Control": "private, no-store" },
  });
});
