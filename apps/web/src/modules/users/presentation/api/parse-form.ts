import type { z } from "zod";

import { ValidationError } from "@/lib/errors";
import { pickFields } from "@/lib/form-data";

/** Reads only the named fields and validates them strictly, so forged fields never reach a use case. */
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The item id a Server Action's `update`/`remove` acts on. Ownership is enforced by the store, not here. */
export function parseItemId(formData: FormData): string {
  const value = formData.get("id");
  const id = typeof value === "string" ? value : "";
  if (!UUID.test(id)) {
    throw new ValidationError({
      details: [
        { field: "id", code: "INVALID", message: "That item was not found." },
      ],
    });
  }
  return id;
}
