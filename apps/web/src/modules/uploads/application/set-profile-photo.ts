import { PERMISSIONS } from "@nitap/database/permissions";

import { ConflictError, NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import type { Authorize } from "./authz";
import type { UploadStore } from "./upload-store";

/**
 * Checks ownership, purpose and READY status, then writes through the users module's `setPhoto`
 * (uploads depends on users, never the reverse).
 */
export function createSetProfilePhoto(deps: {
  store: UploadStore;
  authorize: Authorize;
  updateProfilePhoto: (args: {
    actor: Actor;
    photoUploadId: string;
  }) => Promise<void>;
}) {
  return async function setProfilePhoto(args: {
    actor: Actor | null;
    uploadId: string;
  }): Promise<void> {
    const caller = deps.authorize(args.actor, PERMISSIONS.PROFILE_UPDATE);

    const upload = await deps.store.transaction((tx) => tx.find(args.uploadId));
    if (
      !upload ||
      upload.ownerId !== caller.userId ||
      upload.purpose !== "PROFILE_PHOTO"
    ) {
      throw new NotFoundError();
    }
    if (upload.status !== "READY") {
      throw new ConflictError("UPLOAD_NOT_READY");
    }

    await deps.updateProfilePhoto({ actor: caller, photoUploadId: upload.id });
  };
}

export type SetProfilePhoto = ReturnType<typeof createSetProfilePhoto>;
