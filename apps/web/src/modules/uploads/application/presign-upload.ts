import {
  pendingKey,
  type PresignedUpload,
  type StoragePort,
} from "@nitap/storage";
import { PERMISSIONS } from "@nitap/database/permissions";

import { ConflictError, ValidationError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import {
  assertUploadable,
  MAX_OPEN_UPLOADS,
  MAX_UPLOAD_BYTES,
  UploadNotAllowedError,
  type UploadRuleCode,
} from "../domain/upload-rules";
import type { Authorize } from "./authz";
import type { UploadStore } from "./upload-store";

const FIELD_FOR: Record<UploadRuleCode, string> = {
  UPLOAD_TYPE_NOT_ALLOWED: "mime",
  UPLOAD_TOO_LARGE: "size",
  UPLOAD_INVALID_SIZE: "size",
};

export type PresignUploadResult = {
  uploadId: string;
} & PresignedUpload;

/**
 * Validates type, size and quota, creates the PENDING_UPLOAD row and returns a
 * presigned POST so the bytes go straight to the store.
 */
export function createPresignUpload(deps: {
  store: UploadStore;
  authorize: Authorize;
  storage: StoragePort;
}) {
  return async function presignUpload(args: {
    actor: Actor | null;
    mime: string;
    size: number;
  }): Promise<PresignUploadResult> {
    const caller = deps.authorize(args.actor, PERMISSIONS.PROFILE_UPDATE);

    try {
      assertUploadable({
        purpose: "PROFILE_PHOTO",
        mime: args.mime,
        size: args.size,
      });
    } catch (error) {
      if (error instanceof UploadNotAllowedError) {
        throw new ValidationError({
          code: error.code,
          details: [
            {
              field: FIELD_FOR[error.code],
              code: error.code,
              message: error.message,
            },
          ],
        });
      }
      throw error;
    }

    const created = await deps.store.transaction(async (tx) => {
      const openCount = await tx.countOpen(caller.userId);
      if (openCount >= MAX_OPEN_UPLOADS) {
        throw new ConflictError("UPLOAD_LIMIT_REACHED");
      }
      return tx.create({
        ownerId: caller.userId,
        purpose: "PROFILE_PHOTO",
        objectKey: pendingKey(crypto.randomUUID()),
        mime: args.mime,
        size: args.size,
      });
    });

    const presigned = await deps.storage.presignUpload({
      key: created.objectKey,
      contentType: args.mime,
      maxBytes: MAX_UPLOAD_BYTES,
    });
    return { uploadId: created.id, ...presigned };
  };
}

export type PresignUpload = ReturnType<typeof createPresignUpload>;
