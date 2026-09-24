import { z } from "zod";

import {
  authorizeReportReview,
  claimReport,
  dismissReport,
  resolveReport,
} from "@/composition/moderation";
import { assertSameOrigin } from "@/infrastructure/http/assert-same-origin";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { getActor } from "@/modules/auth";

import { invalid, readJson, uuidParam } from "../../_lib/request";

type Params = { params: Promise<{ id: string }> };

// The reason's allowed values are checked by the use case (spec C12-3); here only the shape.
const body = z.discriminatedUnion("status", [
  z.object({ status: z.literal("UNDER_REVIEW") }).strict(),
  z.object({ status: z.literal("RESOLVED"), reason: z.string() }).strict(),
  z.object({ status: z.literal("DISMISSED"), reason: z.string() }).strict(),
]);

/** PATCH /api/v1/reports/:id — claim, resolve or dismiss (spec C12-8). */
export const PATCH = routeHandler(async (request, ctx: Params) => {
  assertSameOrigin(request);
  const reportId = uuidParam((await ctx.params).id); // 404 on a malformed id, before auth or the body
  const actor = await getActor();
  authorizeReportReview(actor); // 401/404 before the body is read
  const parsed = body.safeParse(await readJson(request));
  if (!parsed.success) throw invalid(parsed.error);
  const input = parsed.data;
  if (input.status === "UNDER_REVIEW") await claimReport({ actor, reportId });
  else if (input.status === "RESOLVED")
    await resolveReport({ actor, reportId, input: { reason: input.reason } });
  else
    await dismissReport({ actor, reportId, input: { reason: input.reason } });
  return Response.json({ data: { id: reportId, status: input.status } });
});
