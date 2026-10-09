"use server";

import { getClientIp } from "@/app/_actions/client-ip";
import { runAction } from "@/app/_actions/run-action";
import type { ActionResult } from "@/lib/action-result";
import { assertFormData } from "@/lib/form-data";
import {
  getActor,
  parseEvidenceForm,
  submitVerificationRequest,
} from "@/modules/auth";

/**
 * Submits alumni verification evidence. A Server Action is a public POST endpoint, so it
 * takes the caller from the session, reads only the named fields (parseEvidenceForm), and lets the use
 * case authorize.
 */
export async function submitVerificationAction(
  formData: FormData
): Promise<ActionResult<{ requestId: string }>> {
  return runAction(async () => {
    assertFormData(formData);
    const input = parseEvidenceForm(formData);
    return submitVerificationRequest({
      actor: await getActor(),
      clientIp: await getClientIp(),
      input,
    });
  });
}
