import { PERMISSIONS } from "@nitap/database/permissions";

import { NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import type { Authorize } from "./authz";
import type { UploadStatus, UploadStore } from "./upload-store";

export type UploadStatusResult = {
  status: UploadStatus;
  rejectReason: string | null;
};

/**
 * Lets the caller's browser poll its own upload while the worker scans it.
 * Owner-scoped.
 */
export function createGetUploadStatus(deps: {
  store: UploadStore;
  authorize: Authorize;
}) {
  return async function getUploadStatus(args: {
    actor: Actor | null;
    uploadId: string;
  }): Promise<UploadStatusResult> {
    const caller = deps.authorize(args.actor, PERMISSIONS.PROFILE_UPDATE);

    const upload = await deps.store.transaction((tx) => tx.find(args.uploadId));
    if (!upload || upload.ownerId !== caller.userId) throw new NotFoundError();

    return { status: upload.status, rejectReason: upload.rejectReason };
  };
}

export type GetUploadStatus = ReturnType<typeof createGetUploadStatus>;
