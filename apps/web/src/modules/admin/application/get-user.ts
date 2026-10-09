import { PERMISSIONS, type Permission } from "@nitap/database/permissions";

import { NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { accessOptions, type AccessOptions } from "../domain/escalation";
import type { AdminStore, UserDetail } from "./admin-store";
import type { Authorize, LoadGrants } from "./authorize-port";

export type UserView = {
  user: UserDetail;
  chapters: { id: string; slug: string }[];
  options: AccessOptions;
  isSelf: boolean;
};

const GRANTABLE: readonly Permission[] = Object.values(PERMISSIONS);

/** The detail page's data, plus which actions the viewer may offer (same rules as the writes). */
export function createGetUser(deps: {
  store: AdminStore;
  authorize: Authorize;
  loadGrants: LoadGrants;
  roles: Readonly<Record<string, readonly Permission[]>>;
  superAdminRole: string;
  now?: () => Date;
}) {
  return async function getUser(args: {
    actor: Actor | null;
    userId: string;
  }): Promise<UserView> {
    const actor = deps.authorize(args.actor, PERMISSIONS.USER_READ_ADMIN, {
      subjectUserId: args.userId,
      concealed: true,
    });
    const user = await deps.store.getUser(args.userId, deps.superAdminRole);
    if (!user) throw new NotFoundError();
    const now = (deps.now ?? (() => new Date()))();
    const [chapters, target] = await Promise.all([
      deps.store.listChapters(),
      deps.loadGrants(args.userId, now),
    ]);
    return {
      user,
      chapters,
      isSelf: actor.userId === args.userId,
      options: accessOptions({
        actor: actor.grants,
        target,
        roles: deps.roles,
        permissions: GRANTABLE,
        now,
      }),
    };
  };
}
export type GetUser = ReturnType<typeof createGetUser>;
