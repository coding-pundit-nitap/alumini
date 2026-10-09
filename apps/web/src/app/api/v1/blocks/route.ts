import { z } from "zod";

import { blockUser } from "@/composition/connections";
import { assertSameOrigin } from "@/infrastructure/http/assert-same-origin";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { ValidationError } from "@/lib/errors";
import { getActor } from "@/modules/auth";
import { readJson } from "../_lib/request";

const body = z.object({ userId: z.uuid() }).strict();

/**
 * POST /api/v1/blocks — block a member. Blocking is by member, not by connection, because it
 * needs no prior request. Lifting it is `DELETE /api/v1/connections/:id` on the blocked row.
 */
export const POST = routeHandler(async (request) => {
  assertSameOrigin(request);
  const raw = await readJson(request);
  const parsed = body.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError({
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "(body)",
        code: "INVALID",
        message: issue.message,
      })),
    });
  }
  const { connectionId } = await blockUser({
    actor: await getActor(),
    targetUserId: parsed.data.userId,
  });
  return Response.json({ data: { id: connectionId, state: "BLOCKED" } });
});
