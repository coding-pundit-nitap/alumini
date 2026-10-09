import { IMAGE_OUTPUT } from "@nitap/jobs";

export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedMime = (typeof ALLOWED_MIME)[number];

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_OPEN_UPLOADS = 5;

// The worker's fixed re-encode target lives in @nitap/jobs (both web and the worker need it); re-exported
// here so the rest of this module reads from one place.
export { IMAGE_OUTPUT };

export type UploadPurpose = "PROFILE_PHOTO";

export type UploadRuleCode =
  "UPLOAD_TYPE_NOT_ALLOWED" | "UPLOAD_TOO_LARGE" | "UPLOAD_INVALID_SIZE";

/**
 * Carries a `code` so the application layer maps to the exact error catalogue
 * entry, never by sniffing the message.
 */
export class UploadNotAllowedError extends Error {
  readonly code: UploadRuleCode;

  constructor(code: UploadRuleCode, message: string) {
    super(message);
    this.name = "UploadNotAllowedError";
    this.code = code;
  }
}

/**
 * Rejects anything the client-declared type/size make already invalid, before a
 * row is ever created.
 */
export function assertUploadable(input: {
  purpose: UploadPurpose;
  mime: string;
  size: number;
}): void {
  if (!(ALLOWED_MIME as readonly string[]).includes(input.mime)) {
    throw new UploadNotAllowedError(
      "UPLOAD_TYPE_NOT_ALLOWED",
      `Unsupported type "${input.mime}". Allowed: ${ALLOWED_MIME.join(", ")}.`
    );
  }
  if (!Number.isInteger(input.size) || input.size <= 0) {
    throw new UploadNotAllowedError(
      "UPLOAD_INVALID_SIZE",
      "The file size must be a positive number."
    );
  }
  if (input.size > MAX_UPLOAD_BYTES) {
    throw new UploadNotAllowedError(
      "UPLOAD_TOO_LARGE",
      `The file is too large. The limit is ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`
    );
  }
}
