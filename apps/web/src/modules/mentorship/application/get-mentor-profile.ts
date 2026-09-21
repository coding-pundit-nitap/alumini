import { PERMISSIONS } from "@nitap/database/permissions";

import type { Actor } from "@/modules/auth";

import type { Authorize } from "./authz";
import type { MentorProfileRecord, MentorQueries } from "./mentor-ports";

export function createGetMentorProfile(deps: {
  queries: MentorQueries;
  authorize: Authorize;
}) {
  return async function getMentorProfile(args: {
    actor: Actor | null;
  }): Promise<MentorProfileRecord | null> {
    const caller = deps.authorize(args.actor, PERMISSIONS.MENTOR_OPT_IN);
    return deps.queries.findProfile(caller.userId);
  };
}
export type GetMentorProfile = ReturnType<typeof createGetMentorProfile>;
