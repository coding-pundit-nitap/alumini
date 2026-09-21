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
