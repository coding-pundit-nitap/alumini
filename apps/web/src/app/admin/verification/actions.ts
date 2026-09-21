"use server";

import { runAction } from "@/app/_actions/run-action";
import type { ActionResult } from "@/lib/action-result";
import { ValidationError } from "@/lib/errors";
import { pickFields } from "@/lib/form-data";
import {
  DECISION_FIELDS,
  decideVerificationRequest,
  decisionSchema,
  getActor,
  validate,
} from "@/modules/auth";

/**
 * A reviewer approves or rejects a verification request. The reviewer is the session's user, never a
 * form field; the use case authorizes, enforces separation of duties and writes everything atomically.
 */
export async function decideVerificationAction(
  formData: FormData
): Promise<ActionResult<{ outcome: "decided" | "already_decided" }>> {
  return runAction(async () => {
    const parsed = validate(
      decisionSchema,
      pickFields(formData, DECISION_FIELDS)
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
    return decideVerificationRequest({
      actor: await getActor(),
      requestId: parsed.data.requestId,
      decision: parsed.data.decision,
      note: parsed.data.note,
    });
  });
}
