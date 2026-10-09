import { z } from "zod";

import { rejectJob } from "@/composition/jobs";
import { assertSameOrigin } from "@/infrastructure/http/assert-same-origin";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { NotFoundError } from "@/lib/errors";
import { getActor } from "@/modules/auth";
import { readJson } from "../../../_lib/request";

const id = z.uuid();
type Params = { params: Promise<{ id: string }> };

/** POST /api/v1/jobs/:id/reject — body: `{ reviewNote }`. */
export const POST = routeHandler(async (request, ctx: Params) => {
  assertSameOrigin(request);
  const body = await readJson(request);
  const jobId = id.safeParse((await ctx.params).id);
  if (!jobId.success) throw new NotFoundError();

  const { status } = await rejectJob({
    actor: await getActor(),
    jobId: jobId.data,
    input: body,
  });
  return Response.json({ data: { id: jobId.data, status } });
});
