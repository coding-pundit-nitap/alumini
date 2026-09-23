/** Transactional never asks; engagement in-app never asks; engagement email respects the stored row, default enabled. */
export function decideChannel(input: {
  category: "TRANSACTIONAL" | "ENGAGEMENT";
  channel: "IN_APP" | "EMAIL";
  preferenceRow: { enabled: boolean } | null;
}): boolean {
  if (input.category === "TRANSACTIONAL") return true;
  if (input.channel === "IN_APP") return true;
  return input.preferenceRow?.enabled ?? true;
}
