import { PERMISSIONS } from "@nitap/database/permissions";

import { NotFoundError, ValidationError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import type { PrivacyInput } from "../domain/profile-input";
import { overridesNotLooser } from "../domain/visibility";
import type { Authorize } from "./authz";
import type { ProfileStore } from "./profile-store";

/**
 * All five settings are replaced together. An override looser than the level is
 * a field error.
 */
export function createUpdateOwnPrivacy(deps: {
  store: ProfileStore;
  authorize: Authorize;
}) {
  return async function updateOwnPrivacy(args: {
    actor: Actor | null;
    input: PrivacyInput;
  }): Promise<void> {
    const caller = deps.authorize(args.actor, PERMISSIONS.PROFILE_UPDATE);
    const { visibility, contact, location, experience, education } = args.input;
    const settings = { visibility, contact, location, experience, education };

    const loose = overridesNotLooser(settings);
    if (loose.length > 0) {
      throw new ValidationError({
        details: loose.map((field) => ({
          field,
          code: "LOOSER_THAN_PROFILE",
          message: "Choose the same level as your profile, or a stricter one.",
        })),
      });
    }

    const updated = await deps.store.updatePrivacy(caller.userId, settings);
    if (!updated) throw new NotFoundError();
  };
}

export type UpdateOwnPrivacy = ReturnType<typeof createUpdateOwnPrivacy>;
