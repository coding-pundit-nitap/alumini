/**
 * Only infrastructure/ may import `@nitap/database/*`. role-matrix.integration.test.ts checks this
 * matches the seeded database.
 */
export {
  ROLE_NAMES,
  ROLE_PERMISSIONS,
  SUPER_ADMIN_ROLE,
} from "@nitap/database/role-permissions";
