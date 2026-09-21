import { ONBOARDING_ROLE_NAMES } from "@nitap/database/role-permissions";
import { z } from "zod";

import { env } from "@/config/env";

import type { EmailPolicy } from "../domain/email-policy";

/** Lowercase hostnames with at least one dot. No wildcards: every recognised domain is listed. */
const DOMAIN =
  /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

const entrySchema = z
  .object({ role: z.enum(ONBOARDING_ROLE_NAMES), autoVerify: z.boolean() })
  .strict();

const policySchema = z.record(z.string().regex(DOMAIN), entrySchema);

/** The configured policy is unusable. The message names problems, never the configured values. */
export class InvalidEmailPolicyError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "InvalidEmailPolicyError";
  }
}

/** Parses INSTITUTIONAL_EMAIL_POLICY. Unset means no domain is institutional; malformed fails closed. */
export function parseEmailPolicy(raw: string | undefined): EmailPolicy {
  if (raw === undefined || raw.trim() === "") return new Map();

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new InvalidEmailPolicyError(
      "INSTITUTIONAL_EMAIL_POLICY is not valid JSON",
      { cause: error }
    );
  }

  const parsed = policySchema.safeParse(json);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => issue.code).join(", ");
    throw new InvalidEmailPolicyError(
      `INSTITUTIONAL_EMAIL_POLICY does not match the expected shape (${problems})`
    );
  }
  return new Map(Object.entries(parsed.data));
}

let cached: EmailPolicy | undefined;

/** The process-wide policy, parsed once. */
export function getEmailPolicy(): EmailPolicy {
  cached ??= parseEmailPolicy(env.INSTITUTIONAL_EMAIL_POLICY);
  return cached;
}

/** Called at server start so a bad value stops the process instead of surprising the first sign-up. */
export function assertEmailPolicyValid(): void {
  getEmailPolicy();
}
