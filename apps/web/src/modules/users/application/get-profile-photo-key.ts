import { NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { canView, effectiveLevel } from "../domain/visibility";
import type { Can } from "./authz";
import { classifyViewer } from "./classify-viewer";
import type { ConnectionLookup } from "./connection-lookup";
import type { ProfileStore } from "./profile-store";

/**
 * The real storage key, used only by `/api/photos/[userId]`. Same visibility
 * check as `getProfileForViewer`.
 */
export function createGetProfilePhotoKey(deps: {
  store: ProfileStore;
  connections: ConnectionLookup;
  can: Can;
  reportError?: (error: unknown) => void;
}) {
  const classify = classifyViewer(deps);

  return async function getProfilePhotoKey(args: {
    actor: Actor | null;
    targetUserId: string;
  }): Promise<{ objectKey: string }> {
    const profile = await deps.store.find(args.targetUserId);
    if (!profile) throw new NotFoundError();

    const viewer = await classify(args.actor, args.targetUserId);
    if (!canView(effectiveLevel(profile.settings, "core"), viewer)) {
      throw new NotFoundError();
    }
    if (profile.photoUploadId === null) throw new NotFoundError();

    const objectKey = await deps.store.findPhotoKey(args.targetUserId);
    if (!objectKey) throw new NotFoundError();
    return { objectKey };
  };
}

export type GetProfilePhotoKey = ReturnType<typeof createGetProfilePhotoKey>;
