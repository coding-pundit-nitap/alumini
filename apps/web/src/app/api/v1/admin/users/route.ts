import { listUsers } from "@/composition/admin";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { getActor } from "@/modules/auth";

/** GET /api/v1/admin/users — user.read_admin; 404 to non-holders. */
export const GET = routeHandler(async (request) => {
  const query = Object.fromEntries(new URL(request.url).searchParams);
  return Response.json(await listUsers({ actor: await getActor(), query }));
});
