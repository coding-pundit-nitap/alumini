import type { AccountState, Actor, Grant, Resource } from "./actor";
import {
  PERMISSIONS,
  SELF_SERVICE_PERMISSIONS,
  type Permission,
} from "./permission";

export type DenyReason =
  "ACCOUNT_STATE" | "NO_GRANT" | "SCOPE_MISMATCH" | "SELF_DECISION";

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

/** RBAC §8.3: a reviewer cannot decide their own verification request. */
const separationOfDuties: Guardrail = ({ actor, permission, resource }) =>
  permission === PERMISSIONS.ALUMNI_VERIFY &&
  resource.subjectUserId === actor.userId
    ? "SELF_DECISION"
    : undefined;

// Ordered. Escalation, self-service and last-Super-Admin (RBAC §8.1, 8.2, 8.4) arrive in Phase 12
// with role.assign / permission.grant, each with its own failing test first.
const GUARDRAILS: readonly Guardrail[] = [separationOfDuties];

/**
 * What an account may do BECAUSE of its state, without any grant (RBAC §7). Everything else is denied
 * before grants are considered. Only self-service permissions belong here: submitting one's own
 * verification request, and `profile.update` (a PENDING or REJECTED account edits its own basic profile;
 * institutional fields stay out of reach of that use case, FR-PROFILE-004).
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
 * The authorization rules, in order (TDS §7.4); the first failure denies. Pure: no I/O.
 * Record-level conditions (RBAC §6) are NOT here; the use case that owns the record checks them
 * after `authorize()` passes.
 */
export function decide({
  actor,
  permission,
  resource = {},
  now,
}: DecideInput): Decision {
  // 1. Account-state gate (RBAC §7). Explicit, not inferred from empty grants. A non-VERIFIED account
  //    may use only what its state allows; grants are never consulted for it.
  if (actor.accountState !== "VERIFIED") {
    return STATE_ALLOWANCES[actor.accountState].includes(permission)
      ? { allow: true }
      : { allow: false, reason: "ACCOUNT_STATE" };
  }

  // 2. Grant match (RBAC §5): GLOBAL, else CHAPTER for the resource's chapter.
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

  // 3. Guardrails (RBAC §8).
  for (const guardrail of GUARDRAILS) {
    const reason = guardrail({ actor, permission, resource });
    if (reason) return { allow: false, reason };
  }

  return { allow: true };
}
