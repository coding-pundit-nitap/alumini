import { z } from "zod";

import {
  authorizeNotifications,
  getNotificationPreferences,
  setNotificationPreference,
} from "@/composition/notifications";
import { assertSameOrigin } from "@/infrastructure/http/assert-same-origin";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { getActor } from "@/modules/auth";
import { NOTIFICATION_DOMAINS } from "@/modules/notifications";

import { invalid, readJson } from "../../_lib/request";

// Only ENGAGEMENT domains are toggleable; transactional mail has no domain and cannot be disabled (N-10).
const patchBody = z
  .object({ domain: z.enum(NOTIFICATION_DOMAINS), enabled: z.boolean() })
  .strict();

/** GET /api/v1/notifications/preferences — email toggle per domain; a missing row means enabled. */
export const GET = routeHandler(async () => {
  const data = await getNotificationPreferences({ actor: await getActor() });
  return Response.json(
    { data },
    { headers: { "Cache-Control": "private, no-store" } }
  );
});

/** PATCH /api/v1/notifications/preferences — body `{ domain, enabled }`. */
export const PATCH = routeHandler(async (request) => {
  assertSameOrigin(request);
  const actor = await getActor();
  authorizeNotifications(actor); // 401/403 before the body is validated
  const parsed = patchBody.safeParse(await readJson(request));
  if (!parsed.success) throw invalid(parsed.error);
  await setNotificationPreference({ actor, ...parsed.data });
  return new Response(null, { status: 204 });
});
