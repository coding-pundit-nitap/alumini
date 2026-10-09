/**
 * Re-exports the role catalogue behind infrastructure/: pure data, but the
 * package path itself is `@nitap/database/*`, which only infrastructure/ may import directly.
 * Composition roots inject this into use cases;
 * role-matrix.integration.test.ts proves it matches the seeded database.
 */
export {
  ROLE_NAMES,
  ROLE_PERMISSIONS,
  SUPER_ADMIN_ROLE,
} from "@nitap/database/role-permissions";
