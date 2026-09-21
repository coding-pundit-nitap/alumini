export type PresignedUpload = {
  url: string;
  fields: Record<string, string>;
};

export type PresignUploadInput = {
  key: string;
  contentType: string;
  maxBytes: number;
};

export type HeadResult = { size: number; contentType: string | null };

/**
 * The one interface a module ever imports for storage. Application code never sees AWS SDK types
 * (strategy §2.3 rule 2); only the S3 adapter (infrastructure-only, TDS §13) does.
 */
export interface StoragePort {
  /** A presigned POST: the browser sends the file straight to the store (system-architecture.md §5.4). */
  presignUpload(input: PresignUploadInput): Promise<PresignedUpload>;
  /** Confirms an object exists and reports its real size/type, without downloading it. */
  head(key: string): Promise<HeadResult>;
  get(key: string): Promise<Buffer>;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  presignDownload(input: {
    key: string;
    expiresInSeconds: number;
  }): Promise<string>;
}

/** `unavailable`: the store could not be reached (network, timeout, 5xx) — retry later. `not_found`: no such key. */
export class StorageError extends Error {
  readonly kind: "unavailable" | "not_found";

  constructor(
    message: string,
    kind: "unavailable" | "not_found",
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "StorageError";
    this.kind = kind;
  }
}
