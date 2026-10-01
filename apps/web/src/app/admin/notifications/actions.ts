"use server";

import { runAction } from "@/app/_actions/run-action";
import { assertFormData } from "@/lib/form-data";
import { replayNotifications } from "@/composition/notifications";
import type { ActionResult } from "@/lib/action-result";
import { NotFoundError } from "@/lib/errors";
import { isUuid } from "@/modules/admin";
import { getActor } from "@/modules/auth";

/** Replays one failed email (existing audited use case). REPLAY_JOB_GONE comes back as the inline error. */
export async function replayNotificationAction(
  form: FormData
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    assertFormData(form);
    const notificationId = form.get("notificationId");
    if (!isUuid(notificationId)) throw new NotFoundError();
    return replayNotifications({ actor: await getActor(), notificationId });
  });
}
