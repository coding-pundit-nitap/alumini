import { IMAGE_OUTPUT, type UploadScanPayload } from "@nitap/jobs";
import type { JobProcessor } from "@nitap/queue";
import { avatarKey, type StoragePort } from "@nitap/storage";
import sharp from "sharp";

import type { ScannerPort } from "../scanner.ts";

const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);
/**
 * Guards against decompression bombs: a decoded image larger than this is
 * refused before re-encoding.
 */
const MAX_DIMENSION = 8_000;

export type UploadScanStoreRow = {
  id: string;
  ownerId: string;
  objectKey: string;
  status: string;
};

/** The narrow slice of the shared upload store this processor needs. */
export type UploadScanStore = {
  find(id: string): Promise<UploadScanStoreRow | null>;
  markReady(id: string, derivativeKey: string): Promise<void>;
  markRejected(id: string, reason: string): Promise<void>;
};

/**
 * Idempotent. A bad image or scanner rejection moves the row to REJECTED
 * without throwing; only a storage outage throws, leaving it PENDING_SCAN.
 */
export function createUploadScanProcessor(deps: {
  store: UploadScanStore;
  storage: StoragePort;
  scanner: ScannerPort;
}): JobProcessor<UploadScanPayload> {
  return async (payload, context) => {
    const upload = await deps.store.find(payload.uploadId);
    if (!upload || upload.status === "READY" || upload.status === "REJECTED") {
      context.logger.info("upload.scan.skipped", {
        metadata: {
          uploadId: payload.uploadId,
          status: upload?.status ?? "missing",
        },
      });
      return;
    }

    // Real network I/O: if the store is unreachable this throws and the job retries.
    const bytes = await deps.storage.get(upload.objectKey);

    try {
      const metadata = await sharp(bytes).metadata();
      if (!metadata.format || !ALLOWED_FORMATS.has(metadata.format)) {
        throw new Error(`unsupported format: ${metadata.format ?? "unknown"}`);
      }
      if (
        (metadata.width ?? 0) > MAX_DIMENSION ||
        (metadata.height ?? 0) > MAX_DIMENSION
      ) {
        throw new Error("image dimensions too large");
      }
    } catch (decodeError) {
      await deps.store.markRejected(upload.id, "Could not process this image.");
      context.logger.warn("upload.scan.rejected", {
        metadata: { uploadId: upload.id, reason: "decode" },
        error: decodeError,
      });
      return;
    }

    const scanResult = await deps.scanner.scan(bytes);
    if (!scanResult.ok) {
      await deps.store.markRejected(upload.id, scanResult.reason);
      context.logger.warn("upload.scan.rejected", {
        metadata: { uploadId: upload.id, reason: "scanner" },
      });
      return;
    }

    // The re-encode itself strips EXIF and any payload a crafted image carries.
    const derivative = await sharp(bytes)
      .resize(IMAGE_OUTPUT.size, IMAGE_OUTPUT.size, { fit: "cover" })
      .webp()
      .toBuffer();
    const derivativeKey = avatarKey(upload.ownerId, upload.id);
    await deps.storage.put(derivativeKey, derivative, "image/webp");

    try {
      await deps.storage.delete(upload.objectKey);
    } catch (error) {
      // Best-effort: an orphaned raw object is cleaned up by the bucket lifecycle rule or the sweep job.
      context.logger.warn("upload.scan.raw_delete_failed", { error });
    }

    await deps.store.markReady(upload.id, derivativeKey);
    context.logger.info("upload.scan.ready", {
      metadata: { uploadId: upload.id },
    });
  };
}
