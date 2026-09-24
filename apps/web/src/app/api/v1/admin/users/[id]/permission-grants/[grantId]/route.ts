import { z } from "zod";

import { revokeGrant } from "@/composition/admin";
import { assertSameOrigin } from "@/infrastructure/http/assert-same-origin";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { NotFoundError } from "@/lib/errors";
import { getActor } from "@/modules/auth";

const uuid = z.uuid();
type Params = { params: Promise<{ id: string; grantId: string }> };
const userId = async (ctx: Params) => {
  const parsed = uuid.safeParse((await ctx.params).id);
  if (!parsed.success) throw new NotFoundError();
  return parsed.data;
};
const grantId = async (ctx: Params) => {
  const parsed = uuid.safeParse((await ctx.params).grantId);
  if (!parsed.success) throw new NotFoundError();
  return parsed.data;
};

/** DELETE /api/v1/admin/users/:id/permission-grants/:grantId — revoke a grant (spec B12-3, B12-4). */
export const DELETE = routeHandler(async (request, ctx: Params) => {
  assertSameOrigin(request);
  await revokeGrant({
    actor: await getActor(),
    userId: await userId(ctx),
    grantId: await grantId(ctx),
  });
  return new Response(null, { status: 204 });
});
