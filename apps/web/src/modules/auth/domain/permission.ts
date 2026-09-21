import {
  PERMISSIONS,
  type Permission as GrantablePermission,
} from "@nitap/database/permissions";

// The grant registry lives in @nitap/database (database/prisma/seed-data/permissions.ts) because the
// seed uses it too; there must be one copy. It is pure data, so the domain may import this one subpath.
export { PERMISSIONS };
export type { GrantablePermission };

/**
 * Permissions allowed by ACCOUNT STATE alone, never by a role or grant (RBAC §7). A PENDING or REJECTED
 * account may submit and view its own verification request; no role can hold this, so it is not in the
 * shared grant registry (the seed and the RBAC §4 matrix test cover only grantable permissions).
 */
export const SELF_SERVICE_PERMISSIONS = {
  VERIFICATION_REQUEST: "verification.request",
} as const;

export type SelfServicePermission =
  (typeof SELF_SERVICE_PERMISSIONS)[keyof typeof SELF_SERVICE_PERMISSIONS];

export type Permission = GrantablePermission | SelfServicePermission;

const REGISTERED: ReadonlySet<string> = new Set(Object.values(PERMISSIONS));

/**
 * Narrows a string read from the database to a GRANTABLE permission; PostgreSQL does not validate
 * permission names. Self-service names are deliberately not accepted: a database row naming one is
 * dropped like any unknown grant.
 */
export function isPermission(value: string): value is GrantablePermission {
  return REGISTERED.has(value);
}
