import { PERMISSIONS } from "@nitap/database/permissions";

import { NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import type { ProfileCoreInput } from "../domain/profile-input";
import type { Authorize } from "./authz";
import type { ProfileStore } from "./profile-store";

/** Always targets the caller, and the input has no institutional fields. */
export function createUpdateOwnProfile(deps: {
  store: ProfileStore;
  authorize: Authorize;
}) {
  return async function updateOwnProfile(args: {
    actor: Actor | null;
    input: ProfileCoreInput;
  }): Promise<void> {
    const caller = deps.authorize(args.actor, PERMISSIONS.PROFILE_UPDATE);
    const { fullName, headline, bio, location } = args.input;
    const updated = await deps.store.updateCore(caller.userId, {
      fullName,
      headline,
      bio,
      location,
    });
    if (!updated) throw new NotFoundError();
  };
}

export type UpdateOwnProfile = ReturnType<typeof createUpdateOwnProfile>;
