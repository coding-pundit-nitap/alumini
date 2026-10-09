import { z } from "zod";

import { reportMessage } from "@/composition/messaging";
import { listReports } from "@/composition/moderation";
import { assertSameOrigin } from "@/infrastructure/http/assert-same-origin";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { getActor } from "@/modules/auth";

import { invalid, readJson } from "../_lib/request";

// POST files reports for messages only; posts and comments are not reportable yet. GET lists every type.
const body = z
  .object({
    targetType: z.literal("MESSAGE"),
    targetId: z.uuid(),
    reason: z.string(),
  })
  .strict();

/**
 * POST /api/v1/reports — report a message you can see. Filing twice returns the
 * first report (200).
 */
export const POST = routeHandler(async (request) => {
  assertSameOrigin(request);
  const parsed = body.safeParse(await readJson(request));
  if (!parsed.success) throw invalid(parsed.error);
  const { reportId, created } = await reportMessage({
    actor: await getActor(),
    messageId: parsed.data.targetId,
    input: { reason: parsed.data.reason },
  });
  return Response.json(
    { data: { id: reportId, status: "OPEN" } },
    { status: created ? 201 : 200 }
  );
});

/**
 * GET /api/v1/reports — the reports queue (report.review; 404 to non-holders).
 * Message text never appears here.
 */
export const GET = routeHandler(async (request) => {
  const query = Object.fromEntries(new URL(request.url).searchParams);
  return Response.json(await listReports({ actor: await getActor(), query }), {
    headers: { "Cache-Control": "private, no-store" },
  });
});
