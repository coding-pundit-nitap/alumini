import { ValidationError } from "@/lib/errors";

/** Reads only the named string fields, ignoring framework fields and anything a client adds. */
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

/** Call first inside `runAction`, so a non-FormData argument is a 400 rather than a TypeError. */
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
