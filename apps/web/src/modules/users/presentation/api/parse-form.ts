import type { z } from "zod";

import { ValidationError } from "@/lib/errors";
import { pickFields } from "@/lib/form-data";

/**
 * Reads ONLY the named fields of a Server Action's form and validates them against a strict schema. A
 * forged id, `userId`, or any field React adds to every form, never reaches a use case.
 */
export function parseForm<S extends z.ZodType>(
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
