import { PERMISSIONS } from "@nitap/database/permissions";

import { NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import type { Authorize } from "./authz";
import type { ProfileStore } from "./profile-store";

/** Pass `null` to remove. Upload checks belong to the uploads module. */
export function createUpdateProfilePhoto(deps: {
  store: ProfileStore;
  authorize: Authorize;
}) {
  return async function updateProfilePhoto(args: {
    actor: Actor | null;
    photoUploadId: string | null;
  }): Promise<void> {
    const caller = deps.authorize(args.actor, PERMISSIONS.PROFILE_UPDATE);
    const updated = await deps.store.setPhoto(
      caller.userId,
      args.photoUploadId
    );
    if (!updated) throw new NotFoundError();
  };
}

export type UpdateProfilePhoto = ReturnType<typeof createUpdateProfilePhoto>;
