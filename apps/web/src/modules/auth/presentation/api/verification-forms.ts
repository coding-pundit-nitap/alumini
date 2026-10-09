import type { z } from "zod";

import { ValidationError } from "@/lib/errors";
import { pickFields } from "@/lib/form-data";

import { validate } from "./schemas";
import {
  DECISION_FIELDS,
  decisionSchema,
  EVIDENCE_FIELDS,
  evidenceSchema,
} from "./verification-schemas";

/**
 * Reads only the named fields and validates them strictly, so forged fields
 * never reach a use case.
 */
function parseForm<S extends z.ZodType>(
  schema: S,
  fields: readonly string[],
  formData: FormData
): z.infer<S> {
  const parsed = validate(schema, pickFields(formData, fields));
  if (!parsed.ok) {
    throw new ValidationError({
      details: Object.entries(parsed.errors).map(([field, message]) => ({
        field,
        code: "INVALID",
        message,
      })),
    });
  }
  return parsed.data;
}

export const parseEvidenceForm = (formData: FormData) =>
  parseForm(evidenceSchema, EVIDENCE_FIELDS, formData);

export const parseDecisionForm = (formData: FormData) =>
  parseForm(decisionSchema, DECISION_FIELDS, formData);
