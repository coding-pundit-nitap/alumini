"use server";

import { runAction } from "@/app/_actions/run-action";
import { assertFormData } from "@/lib/form-data";
import { updateRetentionSetting } from "@/composition/admin";
import type { ActionResult } from "@/lib/action-result";
import { getActor } from "@/modules/auth";

/** Only the two editable fields reach the strict schema. */
export async function updateRetentionAction(
  form: FormData
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    assertFormData(form);
    return updateRetentionSetting({
      actor: await getActor(),
      category: String(form.get("category") ?? ""),
      input: {
        retentionDays: form.get("retentionDays") ?? undefined,
        approvedBy: form.get("approvedBy") ?? null,
      },
    });
  });
}
