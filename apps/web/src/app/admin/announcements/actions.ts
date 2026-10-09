"use server";

import { runAction } from "@/app/_actions/run-action";
import { assertFormData } from "@/lib/form-data";
import { publishAnnouncement, removeAnnouncement } from "@/composition/posts";
import type { ActionResult } from "@/lib/action-result";
import { NotFoundError } from "@/lib/errors";
import { isUuid } from "@/modules/admin";
import { getActor } from "@/modules/auth";

export async function publishAnnouncementAction(input: {
  title: string;
  content: string;
}): Promise<ActionResult<{ postId: string }>> {
  return runAction(async () =>
    publishAnnouncement({ actor: await getActor(), input })
  );
}

export async function removeAnnouncementAction(
  form: FormData
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    assertFormData(form);
    const postId = form.get("postId");
    if (!isUuid(postId)) throw new NotFoundError();
    await removeAnnouncement({ actor: await getActor(), postId });
    return {};
  });
}
