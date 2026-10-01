"use server";

import { runAction } from "@/app/_actions/run-action";
import type { ActionResult } from "@/lib/action-result";
import { assertFormData } from "@/lib/form-data";
import {
  decideVerificationRequest,
  getActor,
  parseDecisionForm,
} from "@/modules/auth";

/**
 * A reviewer approves or rejects a verification request. The reviewer is the session's user, never a
 * form field; the use case authorizes, enforces separation of duties and writes everything atomically.
 */
export async function decideVerificationAction(
  formData: FormData
): Promise<ActionResult<{ outcome: "decided" | "already_decided" }>> {
  return runAction(async () => {
    assertFormData(formData);
    const { requestId, decision, note } = parseDecisionForm(formData);
    return decideVerificationRequest({
      actor: await getActor(),
      requestId,
      decision,
      note,
    });
  });
}
