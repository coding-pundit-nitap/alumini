import { getMentorProfile, saveMentorProfile } from "@/composition/mentorship";
import { assertSameOrigin } from "@/infrastructure/http/assert-same-origin";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { ValidationError } from "@/lib/errors";
import { getActor } from "@/modules/auth";

/** GET /api/v1/mentors/me — the caller's own offer, or `null` if they have not opted in. */
export const GET = routeHandler(async () => {
  const data = await getMentorProfile({ actor: await getActor() });
  return Response.json(
    { data },
    { headers: { "Cache-Control": "private, no-store" } }
  );
});

/** PUT /api/v1/mentors/me — opt in or edit; `accepting: false` pauses (spec M-10). */
export const PUT = routeHandler(async (request) => {
  assertSameOrigin(request);
  const body = await request.json().catch(() => {
    throw new ValidationError({ code: "MALFORMED_REQUEST" });
  });
  const data = await saveMentorProfile({
    actor: await getActor(),
    input: body,
  });
  return Response.json({ data });
});
