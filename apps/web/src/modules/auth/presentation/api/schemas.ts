import { z } from "zod";

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "../../domain/password-policy";

const email = z
  .email("Enter a valid email address.")
  .max(254, "Enter a valid email address.");

const newPassword = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters.`);

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter your name.")
    .max(100, "Use at most 100 characters."),
  email,
  password: newPassword,
});

// An existing password is not held to the new-password length rule; the server decides.
export const loginSchema = z.object({
  email,
  password: z
    .string()
    .min(1, "Enter your password.")
    .max(PASSWORD_MAX_LENGTH, "Enter your password."),
});

export const forgotPasswordSchema = z.object({ email });

export const resendVerificationSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({ newPassword, confirmPassword: z.string() })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "The passwords do not match.",
  });

export type FieldErrors = Record<string, string>;

/** Parses form values; on failure returns the first message for each field. */
export function validate<S extends z.ZodType>(
  schema: S,
  values: unknown
): { ok: true; data: z.infer<S> } | { ok: false; errors: FieldErrors } {
  const parsed = schema.safeParse(values);
  if (parsed.success) return { ok: true, data: parsed.data };

  const errors: FieldErrors = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "form");
    errors[key] ??= issue.message;
  }
  return { ok: false, errors };
}
