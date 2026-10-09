import { z } from "zod";

import { assignRole } from "@/composition/admin";
import { assertSameOrigin } from "@/infrastructure/http/assert-same-origin";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { NotFoundError } from "@/lib/errors";
import { getActor } from "@/modules/auth";
import { readJson } from "../../../../_lib/request";

const uuid = z.uuid();
type Params = { params: Promise<{ id: string }> };
const userId = async (ctx: Params) => {
  const parsed = uuid.safeParse((await ctx.params).id);
  if (!parsed.success) throw new NotFoundError();
  return parsed.data;
};
const json = (request: Request) => readJson(request);

/** POST /api/v1/admin/users/:id/roles — assign a role. */
export const POST = routeHandler(async (request, ctx: Params) => {
  assertSameOrigin(request);
  const result = await assignRole({
    actor: await getActor(),
    userId: await userId(ctx),
    input: await json(request),
  });
  return Response.json({ data: result }, { status: 201 });
});
