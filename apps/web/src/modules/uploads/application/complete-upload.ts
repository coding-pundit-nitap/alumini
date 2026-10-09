import { PERMISSIONS } from "@nitap/database/permissions";
import type { StoragePort } from "@nitap/storage";

import { NotFoundError, ValidationError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import type { Authorize } from "./authz";
import type { UploadStatus, UploadStore } from "./upload-store";

export type CompleteUploadResult = { status: UploadStatus };

/**
 * Idempotent: a row already past PENDING_UPLOAD is a no-op. `storage.head` runs outside the
 * transaction, which may retry.
 */
export function createCompleteUpload(deps: {
  store: UploadStore;
  authorize: Authorize;
  storage: StoragePort;
}) {
  return async function completeUpload(args: {
    actor: Actor | null;
    uploadId: string;
  }): Promise<CompleteUploadResult> {
    const caller = deps.authorize(args.actor, PERMISSIONS.PROFILE_UPDATE);

    const upload = await deps.store.transaction((tx) => tx.find(args.uploadId));
    if (!upload || upload.ownerId !== caller.userId) throw new NotFoundError();
    if (upload.status !== "PENDING_UPLOAD") {
      return { status: upload.status };
    }

    const head = await deps.storage.head(upload.objectKey);
    if (head.size !== upload.size || head.contentType !== upload.mime) {
      throw new ValidationError({
        code: "UPLOAD_MISMATCH",
        details: [
          {
            field: "file",
            code: "UPLOAD_MISMATCH",
            message: "The uploaded file does not match what was declared.",
          },
        ],
      });
    }

    await deps.store.transaction(async (tx) => {
      const moved = await tx.markPendingScan(upload.id);
      if (!moved) return; // lost a race with a concurrent complete call; harmless
      await tx.enqueueScan({ v: 1, uploadId: upload.id });
    });
    return { status: "PENDING_SCAN" };
  };
}

export type CompleteUpload = ReturnType<typeof createCompleteUpload>;
