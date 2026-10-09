import { z } from "zod";

import { editJob, getJob } from "@/composition/jobs";
import { assertSameOrigin } from "@/infrastructure/http/assert-same-origin";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { NotFoundError } from "@/lib/errors";
import { getActor } from "@/modules/auth";
import { readJson } from "../../_lib/request";

const id = z.uuid();
type Params = { params: Promise<{ id: string }> };

/** GET /api/v1/jobs/:id — visibility resolved entirely by getJob. */
export const GET = routeHandler(async (_request, ctx: Params) => {
  const jobId = id.safeParse((await ctx.params).id);
  if (!jobId.success) throw new NotFoundError();
  const job = await getJob({ actor: await getActor(), jobId: jobId.data });
  return Response.json(
    { data: job },
    { headers: { "Cache-Control": "private, no-store" } }
  );
});

/** PATCH /api/v1/jobs/:id — edit. Ownership/job.manage is checked by editJob, not here. */
export const PATCH = routeHandler(async (request, ctx: Params) => {
  assertSameOrigin(request);
  const body = await readJson(request);
  const jobId = id.safeParse((await ctx.params).id);
  if (!jobId.success) throw new NotFoundError();

  const { status } = await editJob({
    actor: await getActor(),
    jobId: jobId.data,
    input: body,
  });
  return Response.json({ data: { id: jobId.data, status } });
});
