export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedMime = (typeof ALLOWED_MIME)[number];

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_OPEN_UPLOADS = 5;

/** The worker's fixed re-encode target: owned here as a product decision, not a worker implementation detail. */
export const IMAGE_OUTPUT = { size: 512, format: "webp" } as const;

export type UploadPurpose = "PROFILE_PHOTO";

export class UploadNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadNotAllowedError";
  }
}

/** Rejects anything the client-declared type/size make already invalid, before a row is ever created. */
export function assertUploadable(input: {
  purpose: UploadPurpose;
  mime: string;
  size: number;
}): void {
  if (!(ALLOWED_MIME as readonly string[]).includes(input.mime)) {
    throw new UploadNotAllowedError(
      `Unsupported type "${input.mime}". Allowed: ${ALLOWED_MIME.join(", ")}.`
    );
  }
  if (!Number.isInteger(input.size) || input.size <= 0) {
    throw new UploadNotAllowedError("The file size must be a positive number.");
  }
  if (input.size > MAX_UPLOAD_BYTES) {
    throw new UploadNotAllowedError(
      `The file is too large. The limit is ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`
    );
  }
}
