import { z } from "zod";

import {
  authorizeNotificationReplay,
  replayNotifications,
} from "@/composition/notifications";
import { assertSameOrigin } from "@/infrastructure/http/assert-same-origin";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { ValidationError } from "@/lib/errors";
import { getActor } from "@/modules/auth";

const bodySchema = z
  .object({
    queue: z.enum(["default", "email"]),
    jobIds: z.array(z.string().min(1).max(200)).min(1).max(100),
  })
  .strict();

/** POST /api/v1/admin/notifications/replay — re-queues failed jobs (notification.replay, audited). Counts only. */
export const POST = routeHandler(async (request) => {
  assertSameOrigin(request);
  const actor = await getActor();
  authorizeNotificationReplay(actor); // 401/403 before the body is read
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw new ValidationError({
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        code: "INVALID",
        message: issue.message,
      })),
    });
  }
  const { retried } = await replayNotifications({ actor, ...parsed.data });
  return Response.json({ data: { retried } });
});
