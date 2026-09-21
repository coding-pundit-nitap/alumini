import type { z } from "zod";

import { ValidationError } from "@/lib/errors";
import { pickFields } from "@/lib/form-data";

import {
  PRIVACY_FIELDS,
  PROFILE_FIELDS,
  updatePrivacySchema,
  updateProfileSchema,
} from "../../domain/profile-input";

/**
 * Reads ONLY the named fields of a Server Action's form and validates them against a strict schema. A
 * forged `userId`, a department or a graduation year, and the fields React adds to every form, never
 * reach a use case.
 */
function parseForm<S extends z.ZodType>(
  schema: S,
  fields: readonly string[],
  formData: FormData
): z.output<S> {
  const parsed = schema.safeParse(pickFields(formData, fields));
  if (!parsed.success) {
    const first = new Map<string, string>();
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "form");
      if (!first.has(field)) first.set(field, issue.message);
    }
    throw new ValidationError({
      details: [...first].map(([field, message]) => ({
        field,
        code: "INVALID",
        message,
      })),
    });
  }
  return parsed.data;
}

export const parseProfileForm = (formData: FormData) =>
  parseForm(updateProfileSchema, PROFILE_FIELDS, formData);

export const parsePrivacyForm = (formData: FormData) =>
  parseForm(updatePrivacySchema, PRIVACY_FIELDS, formData);
