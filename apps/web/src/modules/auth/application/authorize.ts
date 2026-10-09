import { AuthenticationError, AuthorizationError } from "@/lib/errors";

import type { Actor, Resource } from "../domain/actor";
import { decide, type DenyReason } from "../domain/decide";
import type { Permission } from "../domain/permission";

export type AuthzEvent =
  | {
      outcome: "allowed";
      permission: Permission;
      userId: string;
      requestId: string;
    }
  | {
      outcome: "denied";
      permission: Permission;
      userId: string;
      requestId: string;
      reason: DenyReason;
      /** The user the action was about, when known; the audit target. */
      subjectUserId?: string;
      chapterId?: string | null;
    }
  | { outcome: "unauthenticated"; permission: Permission };

/** Receives every authorization decision; infrastructure logs and counts them. */
export interface AuthzObserver {
  record(event: AuthzEvent): void;
}

export type Authorization = {
  /** Throws 401 (no actor), 403 (denied) or 404 (denied on a concealed resource); returns the actor when allowed. */
  authorize(
    actor: Actor | null,
    permission: Permission,
    resource?: Resource
  ): Actor;
  /** For UI decisions ("show the button"). Records nothing. */
  can(
    actor: Actor | null,
    permission: Permission,
    resource?: Resource
  ): boolean;
};

export function createAuthorization(deps: {
  observer: AuthzObserver;
  now: () => Date;
}): Authorization {
  return {
    authorize(actor, permission, resource) {
      if (actor === null) {
        deps.observer.record({ outcome: "unauthenticated", permission });
        throw new AuthenticationError();
      }
      const decision = decide({ actor, permission, resource, now: deps.now() });
      const { userId, requestId } = actor;
      if (decision.allow) {
        deps.observer.record({
          outcome: "allowed",
          permission,
          userId,
          requestId,
        });
        return actor;
      }
      deps.observer.record({
        outcome: "denied",
        permission,
        userId,
        requestId,
        reason: decision.reason,
        subjectUserId: resource?.subjectUserId,
        chapterId: resource?.chapterId,
      });
      // The reason goes to the observer only, never into the response.
      throw new AuthorizationError({
        hideExistence: resource?.concealed === true,
      });
    },

    can(actor, permission, resource) {
      return (
        actor !== null &&
        decide({ actor, permission, resource, now: deps.now() }).allow
      );
    },
  };
}
