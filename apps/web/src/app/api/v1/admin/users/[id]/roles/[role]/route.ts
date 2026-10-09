import { z } from "zod";

import { revokeRole } from "@/composition/admin";
import { assertSameOrigin } from "@/infrastructure/http/assert-same-origin";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { NotFoundError } from "@/lib/errors";
import { getActor } from "@/modules/auth";

const uuid = z.uuid();
type Params = { params: Promise<{ id: string; role: string }> };
const userId = async (ctx: Params) => {
  const parsed = uuid.safeParse((await ctx.params).id);
  if (!parsed.success) throw new NotFoundError();
  return parsed.data;
};

/** DELETE /api/v1/admin/users/:id/roles/:role — revoke a role. */
export const DELETE = routeHandler(async (request, ctx: Params) => {
  assertSameOrigin(request);
  const result = await revokeRole({
    actor: await getActor(),
    userId: await userId(ctx),
    role: (await ctx.params).role,
  });
  return Response.json({ data: result });
});
