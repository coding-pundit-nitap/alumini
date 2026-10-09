import { getMentorProfile, saveMentorProfile } from "@/composition/mentorship";
import { assertSameOrigin } from "@/infrastructure/http/assert-same-origin";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { getActor } from "@/modules/auth";
import { readJson } from "../../_lib/request";

/** GET /api/v1/mentors/me — the caller's own offer, or `null` if they have not opted in. */
export const GET = routeHandler(async () => {
  const data = await getMentorProfile({ actor: await getActor() });
  return Response.json(
    { data },
    { headers: { "Cache-Control": "private, no-store" } }
  );
});

/** PUT /api/v1/mentors/me — opt in or edit; `accepting: false` pauses. */
export const PUT = routeHandler(async (request) => {
  assertSameOrigin(request);
  const body = await readJson(request);
  const data = await saveMentorProfile({
    actor: await getActor(),
    input: body,
  });
  return Response.json({ data });
});
