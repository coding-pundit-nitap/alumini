import { NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { projectProfile, type ProfileView } from "../domain/profile";
import type { Can } from "./authz";
import { classifyViewer } from "./classify-viewer";
import type { ConnectionLookup } from "./connection-lookup";
import type { ProfileAudit } from "./profile-audit";
import type { ProfileStore } from "./profile-store";

/**
 * Returns 404 when nothing is visible, so existence isn't leaked. Privileged
 * reads are audited before anything is returned.
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
