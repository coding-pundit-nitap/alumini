import { z } from "zod";

import {
  authorizeNotificationReplay,
  replayNotifications,
} from "@/composition/notifications";
import { assertSameOrigin } from "@/infrastructure/http/assert-same-origin";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { getActor } from "@/modules/auth";

import { invalid, readJson } from "../../../_lib/request";

const bodySchema = z.object({ notificationId: z.uuid() }).strict();

/** POST /api/v1/admin/notifications/replay — re-queues one notification's failed email (notification.replay, audited). Counts only. */
export const POST = routeHandler(async (request) => {
  assertSameOrigin(request);
  const actor = await getActor();
  authorizeNotificationReplay(actor); // 401/403 before the body is read
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) throw invalid(parsed.error);
  const { retried } = await replayNotifications({ actor, ...parsed.data });
  return Response.json({ data: { retried } });
});
