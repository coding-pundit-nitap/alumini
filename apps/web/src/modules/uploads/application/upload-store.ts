import type { UploadPurpose } from "../domain/upload-rules";

export type UploadStatus =
  "PENDING_UPLOAD" | "PENDING_SCAN" | "READY" | "REJECTED";

export type UploadRecord = {
  id: string;
  ownerId: string;
  purpose: UploadPurpose;
  objectKey: string;
  mime: string;
  size: number;
  status: UploadStatus;
  rejectReason: string | null;
};

export type NewUpload = {
  ownerId: string;
  purpose: UploadPurpose;
  objectKey: string;
  mime: string;
  size: number;
};

/** The `upload.scan` job's payload (contract in `@nitap/jobs`, spec 3C). */
export type UploadScanPayload = { v: 1; uploadId: string };

export type UploadTx = {
  find(id: string): Promise<UploadRecord | null>;
  countOpen(ownerId: string): Promise<number>;
  create(input: NewUpload): Promise<UploadRecord>;
  /** Guarded: only a PENDING_UPLOAD row moves. False if the row was not in that state (or missing). */
  markPendingScan(id: string): Promise<boolean>;
  enqueueScan(payload: UploadScanPayload): Promise<void>;
};

/**
 * Every operation runs inside the caller's transaction, so a row and its outbox event commit or roll
 * back together (the same shape as `VerificationStore`, `ProfileStore`'s siblings in `auth`).
 */
export type UploadStore = {
  transaction<T>(work: (tx: UploadTx) => Promise<T>): Promise<T>;
};
