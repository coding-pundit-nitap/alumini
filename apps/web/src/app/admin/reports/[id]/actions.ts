"use server";

import { runAction } from "@/app/_actions/run-action";
import { assertFormData } from "@/lib/form-data";
import { claimReport } from "@/composition/moderation";
import type { ActionResult } from "@/lib/action-result";
import { NotFoundError } from "@/lib/errors";
import { isUuid } from "@/modules/admin";
import { getActor } from "@/modules/auth";

/**
 * Claim from the report page (ConfirmButton posts FormData and refreshes on
 * success).
 */
export async function claimReportFormAction(
  form: FormData
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    assertFormData(form);
    const reportId = form.get("reportId");
    if (!isUuid(reportId)) throw new NotFoundError();
    await claimReport({ actor: await getActor(), reportId });
    return {};
  });
}
