import type { Actor, Grant, Resource } from "./actor";
import { PERMISSIONS, type Permission } from "./permission";

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
  // 1. Account-state gate (RBAC §7). Explicit, not inferred from empty grants.
  if (actor.accountState !== "VERIFIED") {
    return { allow: false, reason: "ACCOUNT_STATE" };
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
