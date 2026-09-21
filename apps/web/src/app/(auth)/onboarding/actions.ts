"use server";

import { getClientIp } from "@/app/_actions/client-ip";
import { runAction } from "@/app/_actions/run-action";
import type { ActionResult } from "@/lib/action-result";
import { ValidationError } from "@/lib/errors";
import { pickFields } from "@/lib/form-data";
import {
  EVIDENCE_FIELDS,
  evidenceSchema,
  getActor,
  submitVerificationRequest,
  validate,
} from "@/modules/auth";

/**
 * Submits alumni verification evidence (FR-AUTH-003). A Server Action is a public POST endpoint, so it
 * takes the caller from the session, reads only the named fields, and lets the use case authorize.
 */
export async function submitVerificationAction(
  formData: FormData
): Promise<ActionResult<{ requestId: string }>> {
  return runAction(async () => {
    const parsed = validate(
      evidenceSchema,
      pickFields(formData, EVIDENCE_FIELDS)
    );
    if (!parsed.ok) {
      throw new ValidationError({
        details: Object.entries(parsed.errors).map(([field, message]) => ({
          field,
          code: "INVALID",
          message,
        })),
      });
    }
    return submitVerificationRequest({
      actor: await getActor(),
      clientIp: await getClientIp(),
      input: parsed.data,
    });
  });
}
