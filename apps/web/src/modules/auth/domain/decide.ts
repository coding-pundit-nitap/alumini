import type { AccountState, Actor, Grant, Resource } from "./actor";
import {
  PERMISSIONS,
  SELF_SERVICE_PERMISSIONS,
  type Permission,
} from "./permission";

export type DenyReason =
  | "ACCOUNT_STATE"
  | "NO_GRANT"
  | "SCOPE_MISMATCH"
  | "SELF_DECISION"
  | "SELF_SERVICE";

export type Decision = { allow: true } | { allow: false; reason: DenyReason };

export type DecideInput = {
  actor: Actor;
  permission: Permission;
  resource?: Resource;
  /** Injected so grant expiry is deterministic in tests. */
  now: Date;
};

type Guardrail = (input: {
  actor: Actor;
  permission: Permission;
  resource: Resource;
}) => DenyReason | undefined;

/** A reviewer cannot decide their own verification request. */
const separationOfDuties: Guardrail = ({ actor, permission, resource }) =>
  permission === PERMISSIONS.ALUMNI_VERIFY &&
  resource.subjectUserId === actor.userId
    ? "SELF_DECISION"
    : undefined;

const SELF_SERVICE_GUARDED: ReadonlySet<Permission> = new Set([
  PERMISSIONS.ROLE_ASSIGN,
  PERMISSIONS.PERMISSION_GRANT,
  PERMISSIONS.USER_SUSPEND,
  PERMISSIONS.USER_REACTIVATE,
]);

/** Nobody changes their own access or account state. */
const noSelfService: Guardrail = ({ permission, actor, resource }) =>
  SELF_SERVICE_GUARDED.has(permission) &&
  resource.subjectUserId === actor.userId
    ? "SELF_SERVICE"
    : undefined;

// Escalation and last-super-admin checks need target data, so they live in the admin use cases.
const GUARDRAILS: readonly Guardrail[] = [separationOfDuties, noSelfService];

/**
 * Self-service permissions an account has because of its state, without any
 * grant.
 */
const STATE_ALLOWANCES: Readonly<
  Record<Exclude<AccountState, "VERIFIED">, readonly Permission[]>
> = {
  PENDING: [
    SELF_SERVICE_PERMISSIONS.VERIFICATION_REQUEST,
    PERMISSIONS.PROFILE_UPDATE,
  ],
  REJECTED: [
    SELF_SERVICE_PERMISSIONS.VERIFICATION_REQUEST,
    PERMISSIONS.PROFILE_UPDATE,
  ],
  SUSPENDED: [],
  DEACTIVATED: [],
};

const isLive = (grant: Grant, now: Date) =>
  grant.expiresAt === null || grant.expiresAt > now;

/**
 * Authorization rules in order; the first failure denies. Record-level checks
 * belong to the use case.
 */
export function decide({
  actor,
  permission,
  resource = {},
  now,
}: DecideInput): Decision {
  // Non-VERIFIED accounts get only what their state allows; grants are never consulted.
  if (actor.accountState !== "VERIFIED") {
    return STATE_ALLOWANCES[actor.accountState].includes(permission)
      ? { allow: true }
      : { allow: false, reason: "ACCOUNT_STATE" };
  }

  const candidates = actor.grants.filter(
    (grant) => grant.permission === permission && isLive(grant, now)
  );
  const matches = candidates.some(
    (grant) =>
      grant.scope === "GLOBAL" ||
      (resource.chapterId != null && grant.chapterId === resource.chapterId)
  );
  if (!matches) {
    return {
      allow: false,
      reason: candidates.length > 0 ? "SCOPE_MISMATCH" : "NO_GRANT",
    };
  }

  for (const guardrail of GUARDRAILS) {
    const reason = guardrail({ actor, permission, resource });
    if (reason) return { allow: false, reason };
  }

  return { allow: true };
}
