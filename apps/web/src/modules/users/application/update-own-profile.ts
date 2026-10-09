import { PERMISSIONS } from "@nitap/database/permissions";

import { NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import type { ProfileCoreInput } from "../domain/profile-input";
import type { Authorize } from "./authz";
import type { ProfileStore } from "./profile-store";

/**
 * A member edits their own name, headline, bio and location. There is no user id in the
 * arguments: the target is always the caller, so editing someone else's profile cannot be expressed. The
 * input type has no institutional fields, and the store port has no way to write them.
 */
export function createUpdateOwnProfile(deps: {
  store: ProfileStore;
  authorize: Authorize;
}) {
  return async function updateOwnProfile(args: {
    actor: Actor | null;
    input: ProfileCoreInput;
  }): Promise<void> {
    const caller = deps.authorize(args.actor, PERMISSIONS.PROFILE_UPDATE);
    // Picks the four fields; anything else that reached this point is dropped.
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
