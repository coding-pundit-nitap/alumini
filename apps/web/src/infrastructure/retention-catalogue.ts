/**
 * Re-exports the SRS §45 retention catalogue behind infrastructure/ (same reason as role-permissions.ts):
 * pure data, injected into the admin use cases by the composition root (12G G-2).
 */
export {
  RETENTION_CATALOGUE,
  RETENTION_CATEGORIES,
} from "@nitap/database/retention";
export type { RetentionCategory } from "@nitap/database/retention";
