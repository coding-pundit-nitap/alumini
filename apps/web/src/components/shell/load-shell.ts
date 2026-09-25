import { cache } from "react";

import { getMentorProfile } from "@/composition/mentorship";
import { loadTicks } from "@/composition/ticks";
import { getOwnProfile } from "@/composition/users";
import type { Tick } from "@/lib/role-tick";
import { can, getActor } from "@/modules/auth";

import { buildNav, type NavModel } from "./nav-model";

export type ShellUser = {
  id: string;
  name: string;
  headline: string | null;
  photoUrl: string | null;
  tick: Tick | null;
};
/** null = signed out. */
export type ShellData = {
  nav: NavModel;
  user: ShellUser;
  verified: boolean;
} | null;

/** Everything the member shell needs, once per render. Never includes email, phone or roll number. */
export const loadShell = cache(async (): Promise<ShellData> => {
  const actor = await getActor();
  if (!actor) return null;

  const verified = actor.accountState === "VERIFIED";
  const [profile, isMentor, ticks] = await Promise.all([
    getOwnProfile({ actor }).catch(() => null),
    verified
      ? getMentorProfile({ actor })
          .then(Boolean)
          .catch(() => false)
      : false,
    // A tick is decoration: never let it take the shell down.
    loadTicks([actor.userId]).catch(() => new Map<string, Tick>()),
  ]);

  return {
    // The session's own name is not on the Actor; the profile is created at sign-up, so this is a fallback.
    user: {
      id: actor.userId,
      name: profile?.fullName || "Member",
      headline: profile?.headline ?? null,
      photoUrl: profile?.photoUploadId ? `/api/photos/${actor.userId}` : null,
      tick: ticks.get(actor.userId) ?? null,
    },
    nav: buildNav({
      accountState: actor.accountState,
      can: (permission) => can(actor, permission),
      isMentor,
    }),
    verified,
  };
});
