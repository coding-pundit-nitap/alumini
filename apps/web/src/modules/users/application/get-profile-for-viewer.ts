import { NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { projectProfile, type ProfileView } from "../domain/profile";
import type { Can } from "./authz";
import { classifyViewer } from "./classify-viewer";
import type { ConnectionLookup } from "./connection-lookup";
import type { ProfileAudit } from "./profile-audit";
import type { ProfileStore } from "./profile-store";

/**
 * What one viewer may see of one profile. The profile is loaded, the viewer is classified, and the pure
 * `projectProfile` decides; a null projection is a 404, so a profile's existence is not leaked.
 * A privileged read (`profile.read_any`) is audited BEFORE anything is returned: an
 * unaudited privileged read must not happen.
 */
export function createGetProfileForViewer(deps: {
  store: ProfileStore;
  connections: ConnectionLookup;
  audit: ProfileAudit;
  can: Can;
  reportError?: (error: unknown) => void;
}) {
  const classify = classifyViewer(deps);

  return async function getProfileForViewer(args: {
    actor: Actor | null;
    targetUserId: string;
  }): Promise<ProfileView> {
    const profile = await deps.store.find(args.targetUserId);
    if (!profile) throw new NotFoundError();

    const viewer = await classify(args.actor, args.targetUserId);
    const view = projectProfile(profile, viewer);
    if (!view) throw new NotFoundError();

    if (viewer === "privileged" && args.actor) {
      await deps.audit.recordPrivilegedRead({
        actorId: args.actor.userId,
        targetUserId: args.targetUserId,
      });
    }
    return view;
  };
}

export type GetProfileForViewer = ReturnType<typeof createGetProfileForViewer>;
