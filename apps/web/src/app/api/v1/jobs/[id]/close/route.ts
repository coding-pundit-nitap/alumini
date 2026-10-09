import { z } from "zod";

import { closeJob } from "@/composition/jobs";
import { assertSameOrigin } from "@/infrastructure/http/assert-same-origin";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { NotFoundError } from "@/lib/errors";
import { getActor } from "@/modules/auth";

const id = z.uuid();
type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/jobs/:id/close — withdraw: poster or job.manage, never sets
 * EXPIRED.
 */
export const POST = routeHandler(async (request, ctx: Params) => {
  assertSameOrigin(request);
  const jobId = id.safeParse((await ctx.params).id);
  if (!jobId.success) throw new NotFoundError();

  const { status } = await closeJob({
    actor: await getActor(),
    jobId: jobId.data,
  });
  return Response.json({ data: { id: jobId.data, status } });
});
