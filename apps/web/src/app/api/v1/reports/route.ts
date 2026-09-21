import { z } from "zod";

import { reportMessage } from "@/composition/messaging";
import { assertSameOrigin } from "@/infrastructure/http/assert-same-origin";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { getActor } from "@/modules/auth";

import { invalid, readJson } from "../_lib/request";

// Phase 9 files reports for messages only; posts and comments arrive with Phase 10 (D6).
const body = z
  .object({
    targetType: z.literal("MESSAGE"),
    targetId: z.uuid(),
    reason: z.string(),
  })
  .strict();

/** POST /api/v1/reports — report a message you can see. Filing twice returns the first report (200). */
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
