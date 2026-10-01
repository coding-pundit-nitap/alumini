"use server";

import { runAction } from "@/app/_actions/run-action";
import { updateRetentionSetting } from "@/composition/admin";
import type { ActionResult } from "@/lib/action-result";
import { getActor } from "@/modules/auth";

/** 12G: the category names the row; only the two editable fields reach the strict schema. */
export async function updateRetentionAction(
  form: FormData
): Promise<ActionResult<unknown>> {
  return runAction(async () =>
    updateRetentionSetting({
      actor: await getActor(),
      category: String(form.get("category") ?? ""),
      input: {
        retentionDays: form.get("retentionDays") ?? undefined,
        approvedBy: form.get("approvedBy") ?? null,
      },
    })
  );
}
