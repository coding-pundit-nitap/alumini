/**
 * Re-exports the role catalogue behind infrastructure/ (strategy §2.4 item 6): pure data, but the
 * package path itself is `@nitap/database/*`, which only infrastructure/ may import directly.
 * Composition roots inject this into use cases (RBAC §11: use cases name permissions, not roles);
 * role-matrix.integration.test.ts proves it matches the seeded database.
 */
export {
  ROLE_PERMISSIONS,
  SUPER_ADMIN_ROLE,
} from "@nitap/database/role-permissions";
