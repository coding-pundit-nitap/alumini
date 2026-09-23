import { listAuditLog } from "@/composition/admin";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { getActor } from "@/modules/auth";

/** GET /api/v1/admin/audit-log — filtered, keyset-paged audit read (audit.read; 404 to non-holders). */
export const GET = routeHandler(async (request) => {
  const query = Object.fromEntries(new URL(request.url).searchParams);
  const page = await listAuditLog({ actor: await getActor(), query });
  return Response.json(page);
});
