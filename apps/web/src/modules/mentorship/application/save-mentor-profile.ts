import { PERMISSIONS } from "@nitap/database/permissions";

import type { Actor } from "@/modules/auth";

import { mentorProfileInput } from "../domain/mentor-profile";
import type { Authorize } from "./authz";
import type { MentorProfileRecord, MentorProfileStore } from "./mentor-ports";
import { parse } from "./validation";

/** Opt in and edit the offer. Only the caller's own row can be written. */
export function createSaveMentorProfile(deps: {
  store: MentorProfileStore;
  authorize: Authorize;
}) {
  return async function saveMentorProfile(args: {
    actor: Actor | null;
    input: unknown;
  }): Promise<MentorProfileRecord> {
    const caller = deps.authorize(args.actor, PERMISSIONS.MENTOR_OPT_IN);
    return deps.store.upsert(
      caller.userId,
      parse(mentorProfileInput, args.input)
    );
  };
}
export type SaveMentorProfile = ReturnType<typeof createSaveMentorProfile>;
