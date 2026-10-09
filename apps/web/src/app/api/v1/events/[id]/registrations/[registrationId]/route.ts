import { z } from "zod";

import { markAttendance } from "@/composition/events";
import { assertSameOrigin } from "@/infrastructure/http/assert-same-origin";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { getActor } from "@/modules/auth";
import { readJson } from "../../../../_lib/request";

const id = z.uuid();
const body = z.object({ state: z.enum(["ATTENDED", "NO_SHOW"]) });

type Params = { params: Promise<{ id: string; registrationId: string }> };

/** PATCH /api/v1/events/:id/registrations/:registrationId — organizer/manager marks attendance. */
export const PATCH = routeHandler(async (request, ctx: Params) => {
  assertSameOrigin(request);
  const { id: rawId, registrationId: rawRegistrationId } = await ctx.params;
  const eventId = id.safeParse(rawId);
  const registrationId = id.safeParse(rawRegistrationId);
  // A malformed id and an unknown one are the same answer.
  if (!eventId.success || !registrationId.success) throw new NotFoundError();

  const raw = await readJson(request);
  const parsed = body.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError({
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "state",
        code: "INVALID",
        message: issue.message,
      })),
    });
  }

  const result = await markAttendance({
    actor: await getActor(),
    eventId: eventId.data,
    registrationId: registrationId.data,
    state: parsed.data.state,
  });
  return Response.json({ data: result });
});
