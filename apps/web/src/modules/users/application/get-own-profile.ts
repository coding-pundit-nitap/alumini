import { AuthenticationError, NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import type { ProfileRecord } from "../domain/profile";
import type { ProfileStore } from "./profile-store";

/** Needs a session but no permission. */
export function createGetOwnProfile(deps: { store: ProfileStore }) {
  return async function getOwnProfile(args: {
    actor: Actor | null;
  }): Promise<ProfileRecord> {
    if (!args.actor) throw new AuthenticationError();
    const record = await deps.store.find(args.actor.userId);
    if (!record) throw new NotFoundError();
    return record;
  };
}

export type GetOwnProfile = ReturnType<typeof createGetOwnProfile>;
