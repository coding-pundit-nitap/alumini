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
