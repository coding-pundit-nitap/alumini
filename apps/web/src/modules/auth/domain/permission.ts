import {
  PERMISSIONS,
  type Permission as GrantablePermission,
} from "@nitap/database/permissions";

// The grant registry lives in @nitap/database because the seed uses it too. It is pure data, so the
// domain may import this one subpath.
export { PERMISSIONS };
export type { GrantablePermission };

/**
 * Granted by account state alone, never by a role, so they are not in the grant
 * registry.
 */
export const SELF_SERVICE_PERMISSIONS = {
  VERIFICATION_REQUEST: "verification.request",
} as const;

export type SelfServicePermission =
  (typeof SELF_SERVICE_PERMISSIONS)[keyof typeof SELF_SERVICE_PERMISSIONS];

export type Permission = GrantablePermission | SelfServicePermission;

const REGISTERED: ReadonlySet<string> = new Set(Object.values(PERMISSIONS));

/**
 * Self-service names are rejected, so a database row naming one is dropped like
 * any unknown grant.
 */
export function isPermission(value: string): value is GrantablePermission {
  return REGISTERED.has(value);
}
