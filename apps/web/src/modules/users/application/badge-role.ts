import { PERMISSIONS } from "@nitap/database/permissions";

import { NotFoundError, ValidationError } from "@/lib/errors";
import { NO_TICK, pickTick, tickOptions, type Tick } from "@/lib/role-tick";
import type { Actor } from "@/modules/auth";

import type { Authorize } from "./authz";

/** Which roles the member holds and which tick they chose (null = automatic). Null when there is no profile. */
export type BadgeStore = {
  readChoice(
    userId: string
  ): Promise<{ roles: string[]; preference: string | null } | null>;
  /** False when the user has no profile row. */
  setChoice(userId: string, preference: string | null): Promise<boolean>;
};

/** "AUTO", a held role name, or "NONE". */
export type BadgeChoice = string;
export const AUTO_TICK = "AUTO";

/** The member's tick settings: the ticks they can pick, what they picked, and the tick that shows now. */
export function createGetBadgeSettings(deps: {
  badges: BadgeStore;
  authorize: Authorize;
}) {
  return async function getBadgeSettings(args: {
    actor: Actor | null;
  }): Promise<{
    options: Tick[];
    choice: BadgeChoice;
    current: Tick | null;
  }> {
    const caller = deps.authorize(args.actor, PERMISSIONS.PROFILE_UPDATE);
    const found = await deps.badges.readChoice(caller.userId);
    if (!found) throw new NotFoundError();
    const options = tickOptions(found.roles);
    const held = options.some((o) => o.role === found.preference);
    return {
      options,
      // A stored role that is no longer held reads as automatic, which is what shows.
      choice:
        found.preference === NO_TICK
          ? NO_TICK
          : held
            ? found.preference!
            : AUTO_TICK,
      current: pickTick({
        verified: caller.accountState === "VERIFIED",
        roles: found.roles,
        preference: found.preference,
      }),
    };
  };
}

/** A member picks the tick on their photo (UI-15): automatic, one of the roles they hold, or none. */
export function createSetBadgeRole(deps: {
  badges: BadgeStore;
  authorize: Authorize;
}) {
  return async function setBadgeRole(args: {
    actor: Actor | null;
    choice: unknown;
  }): Promise<void> {
    const caller = deps.authorize(args.actor, PERMISSIONS.PROFILE_UPDATE);
    const found = await deps.badges.readChoice(caller.userId);
    if (!found) throw new NotFoundError();
    const choice = args.choice;
    const valid =
      choice === AUTO_TICK ||
      choice === NO_TICK ||
      tickOptions(found.roles).some((o) => o.role === choice);
    if (typeof choice !== "string" || !valid) {
      throw new ValidationError({
        details: [
          {
            field: "choice",
            code: "INVALID",
            message: "Choose one of your roles.",
          },
        ],
      });
    }
    const saved = await deps.badges.setChoice(
      caller.userId,
      choice === AUTO_TICK ? null : choice
    );
    if (!saved) throw new NotFoundError();
  };
}
