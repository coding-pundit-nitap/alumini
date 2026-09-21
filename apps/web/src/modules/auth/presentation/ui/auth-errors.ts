import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "../../domain/password-policy";

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Email or password is incorrect.",
  EMAIL_NOT_VERIFIED: "Confirm your email address before signing in.",
  ACCOUNT_DEACTIVATED: "This account has been deactivated.",
  TOKEN_EXPIRED: "This link has expired.",
  INVALID_TOKEN: "This link is invalid or has already been used.",
  PASSWORD_TOO_SHORT: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
  PASSWORD_TOO_LONG: `Use at most ${PASSWORD_MAX_LENGTH} characters.`,
};

const GENERIC = "Something went wrong. Please try again.";

/**
 * Better Auth's error format is not ours (ADR-005), so the UI maps its codes to copy in one place.
 * Unknown codes get a generic message; a raw code or server message is never shown.
 */
export function authErrorMessage(
  error: { code?: string; status?: number } | null | undefined
): string {
  if (error?.status === 429) {
    return "Too many attempts. Please wait a few minutes and try again.";
  }
  return (error?.code && MESSAGES[error.code]) || GENERIC;
}
