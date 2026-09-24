/** Returns /dashboard only if the actor is VERIFIED, null otherwise. */
export function verifiedHome(
  actor: { accountState: string } | null
): "/dashboard" | null {
  return actor?.accountState === "VERIFIED" ? "/dashboard" : null;
}
