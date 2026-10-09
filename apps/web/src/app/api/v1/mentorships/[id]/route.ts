import { z } from "zod";

import { transitionMentorship } from "@/composition/mentorship";
import { assertSameOrigin } from "@/infrastructure/http/assert-same-origin";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { getActor } from "@/modules/auth";
import { readJson } from "../../_lib/request";

const patchBody = z
  .object({
    action: z.enum(["accept", "decline", "cancel", "start", "complete"]),
    note: z.string().optional(),
  })
  .strict();
const id = z.uuid();

type Params = { params: Promise<{ id: string }> };

/** PATCH /api/v1/mentorships/:id — accept, decline, cancel, start or complete. */
export const PATCH = routeHandler(async (request, ctx: Params) => {
  assertSameOrigin(request);
  const body = await readJson(request);
  const parsed = patchBody.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError({
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "(body)",
        code: "INVALID",
        message: issue.message,
      })),
    });
  }

  const mentorshipId = id.safeParse((await ctx.params).id);
  // A malformed id and an unknown one are the same answer.
  if (!mentorshipId.success) throw new NotFoundError();

  const { state } = await transitionMentorship({
    actor: await getActor(),
    mentorshipId: mentorshipId.data,
    action: parsed.data.action,
    note: parsed.data.note,
  });
  return Response.json({ data: { id: mentorshipId.data, state } });
});
