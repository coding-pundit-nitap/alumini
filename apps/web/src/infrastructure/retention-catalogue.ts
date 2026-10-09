/**
 * Re-exports the retention catalogue behind infrastructure/ (same reason as role-permissions.ts):
 * pure data, injected into the admin use cases by the composition root.
 */
export {
  RETENTION_CATALOGUE,
  RETENTION_CATEGORIES,
} from "@nitap/database/retention";
export type { RetentionCategory } from "@nitap/database/retention";
