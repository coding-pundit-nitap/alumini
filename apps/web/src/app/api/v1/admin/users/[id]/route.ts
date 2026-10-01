import { z } from "zod";

import { changeAccountState, getUser } from "@/composition/admin";
import { assertSameOrigin } from "@/infrastructure/http/assert-same-origin";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { NotFoundError } from "@/lib/errors";
import { getActor } from "@/modules/auth";
import { readJson } from "../../../_lib/request";

const uuid = z.uuid();
type Params = { params: Promise<{ id: string }> };
const userId = async (ctx: Params) => {
  const parsed = uuid.safeParse((await ctx.params).id);
  if (!parsed.success) throw new NotFoundError();
  return parsed.data;
};
const json = (request: Request) => readJson(request);

/** GET /api/v1/admin/users/:id — spec B12-11. */
export const GET = routeHandler(async (_request, ctx: Params) => {
  const view = await getUser({
    actor: await getActor(),
    userId: await userId(ctx),
  });
  return Response.json({ data: view });
});

/** PATCH /api/v1/admin/users/:id — `{ accountState, reason? }` (spec B12-1, C-7). */
export const PATCH = routeHandler(async (request, ctx: Params) => {
  assertSameOrigin(request);
  const result = await changeAccountState({
    actor: await getActor(),
    userId: await userId(ctx),
    input: await json(request),
  });
  return Response.json({ data: result });
});
