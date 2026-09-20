import { PERMISSIONS, type Permission } from "@nitap/database/permissions";

// The registry lives in @nitap/database (database/prisma/seed-data/permissions.ts) because the seed
// uses it too; there must be one copy. It is pure data, so the domain may import this one subpath.
export { PERMISSIONS };
export type { Permission };

const REGISTERED: ReadonlySet<string> = new Set(Object.values(PERMISSIONS));

/** Narrows a string read from the database; PostgreSQL does not validate permission names. */
export function isPermission(value: string): value is Permission {
  return REGISTERED.has(value);
}
