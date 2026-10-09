/** What the policy says about one institutional email domain. `role` is data; code never inspects it. */
export type PolicyEntry = { role: string; autoVerify: boolean };

/** Lowercase domain → entry. Built and validated by infrastructure from configuration. */
export type EmailPolicy = ReadonlyMap<string, PolicyEntry>;

export type EmailClass =
  | { kind: "EXTERNAL" }
  | { kind: "INSTITUTIONAL"; role: string; autoVerify: boolean };

/**
 * The domain after the last `@` is matched exactly, never as a suffix, so `nitap.ac.in.evil.com` and
 * `"a@nitap.ac.in"@evil.com` are external.
 */
export function classifyEmail(email: string, policy: EmailPolicy): EmailClass {
  if (/\s/.test(email)) return { kind: "EXTERNAL" };
  const at = email.lastIndexOf("@");
  if (at < 1) return { kind: "EXTERNAL" };
  const entry = policy.get(email.slice(at + 1).toLowerCase());
  if (!entry) return { kind: "EXTERNAL" };
  return {
    kind: "INSTITUTIONAL",
    role: entry.role,
    autoVerify: entry.autoVerify,
  };
}
