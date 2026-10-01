import { ValidationError } from "@/lib/errors";

/**
 * Reads ONLY the named string fields of a form. React adds framework fields to a Server Action's
 * FormData, and a hostile client can add any other; neither reaches the use case. A file where a
 * string is expected is ignored.
 */
export function pickFields<K extends string>(
  formData: FormData,
  keys: readonly K[]
): Partial<Record<K, string>> {
  const picked: Partial<Record<K, string>> = {};
  for (const key of keys) {
    const value = formData.get(key);
    if (typeof value === "string") picked[key] = value;
  }
  return picked;
}

/**
 * A Server Action's arguments come from the request, so a client can send anything in place of the form.
 * Call first inside `runAction`: anything but FormData is a 400, not a TypeError logged as a server fault.
 */
export function assertFormData(value: unknown): asserts value is FormData {
  if (!(value instanceof FormData)) {
    throw new ValidationError({ code: "MALFORMED_REQUEST" });
  }
}

/** The same guard for actions that take a plain object (client components calling an action directly). */
export function assertObjectInput(
  value: unknown
): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ValidationError({ code: "MALFORMED_REQUEST" });
  }
}
